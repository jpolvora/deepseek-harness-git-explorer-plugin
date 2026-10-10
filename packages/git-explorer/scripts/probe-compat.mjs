/**
 * Compatibility probe: does the DSH runtime on this machine still offer the contracts this
 * plugin is built against?
 *
 * A published plugin gets installed into runtimes newer than the one it was built on, so
 * its assumptions need a one-command check. Shipped packages live *inside* the desktop's
 * `app.asar` (only third-party plugins sit in the profile's `node_modules`), so this probe
 * reads the archive directly for the runtime version, the frozen client module table and
 * the right-sidebar slot keys, and reads the profile for the plugin's own installation.
 *
 * Usage:
 *   node scripts/probe-compat.mjs
 *   node scripts/probe-compat.mjs --app <install dir> --profile <profile dir>
 *   node scripts/probe-compat.mjs --json
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** The plugin's own package name, as a profile records it. */
const PLUGIN = '@jpolv/dsh-git-explorer'

/** The modules the browser half requires from the page's frozen module table. */
const REQUIRED_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** The slots the panel registers into or reads. */
const REQUIRED_SLOTS = [
  'sidebar.right.pane.tab',
  'sidebar.right.pane.tab.title',
  'sidebar.right.tab.guide.entry',
]

/** The Remote endpoints the host half must expose. */
const REQUIRED_ENDPOINTS = [
  'git/status', 'git/fileDiff', 'git/fileStats', 'git/patch', 'git/log',
  'git/stage', 'git/unstage', 'git/discard', 'git/commit',
]

/** Read one command-line flag's value. */
function flag(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const findings = []
/** Record one check. */
function check(area, label, ok, detail = '') {
  findings.push({ area, label, ok, detail })
}

/** Read a file, or undefined when it is absent. */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Minimal ASAR reader: the format is a pickle-framed JSON directory followed by the
 * concatenated file bodies, which is all this probe needs.
 *
 * @param path - the archive path.
 * @returns a reader with `list` and `read`.
 */
function openAsar(path) {
  const buffer = readFileSync(path)
  const headerSize = buffer.readUInt32LE(4)
  // The directory JSON is pickle-framed; rather than trusting one offset, take the first
  // balanced object after the two length fields, which is stable across asar writers.
  const start = buffer.indexOf('{', 8)
  let depth = 0
  let end = start
  for (; end < buffer.length; end += 1) {
    const byte = buffer[end]
    if (byte === 0x7b) depth += 1
    else if (byte === 0x7d) {
      depth -= 1
      if (depth === 0) {
        end += 1
        break
      }
    }
  }
  const header = JSON.parse(buffer.subarray(start, end).toString('utf8'))
  const base = 8 + headerSize
  const files = []
  const walk = (node, prefix) => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const full = prefix === '' ? name : `${prefix}/${name}`
      if (entry.files === undefined) files.push({ path: full, offset: Number(entry.offset ?? 0), size: entry.size ?? 0 })
      else walk(entry, full)
    }
  }
  walk(header, '')
  return {
    list: () => files,
    read: (wanted) => {
      const entry = files.find((candidate) => candidate.path === wanted)
      if (entry === undefined) return undefined
      return buffer.subarray(base + entry.offset, base + entry.offset + entry.size).toString('utf8')
    },
  }
}

/** Find the desktop install root: the directory holding `resources/app.asar`. */
function findAppRoot(explicit) {
  if (explicit !== undefined) return explicit
  const candidates = [
    process.env.LOCALAPPDATA === undefined ? undefined : join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness'),
    process.env.PROGRAMFILES === undefined ? undefined : join(process.env.PROGRAMFILES, 'DeepSeek Harness'),
  ].filter((value) => value !== undefined)
  return candidates.find((candidate) => existsSync(join(candidate, 'resources', 'app.asar')))
}

/** Find a profile directory under the DSH home. */
function findProfileRoot(explicit) {
  if (explicit !== undefined) return explicit
  const home = process.env.DSH_HOME ?? (process.env.USERPROFILE === undefined ? undefined : join(process.env.USERPROFILE, '.dsh'))
  if (home === undefined) return undefined
  const profiles = join(home, 'profiles')
  if (!existsSync(profiles)) return undefined
  const names = readdirSync(profiles, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  if (names.length === 0) return undefined
  // Prefer the profile that actually carries this plugin.
  const withPlugin = names.find((entry) => existsSync(join(profiles, entry.name, 'node_modules', PLUGIN)))
  return join(profiles, (withPlugin ?? names[0]).name)
}

const appRoot = findAppRoot(flag('app'))
const profileRoot = findProfileRoot(flag('profile'))
const asarPath = appRoot === undefined ? undefined : join(appRoot, 'resources', 'app.asar')

// 1. The archive, the runtime version and the frozen client module table.
if (asarPath === undefined || !existsSync(asarPath)) {
  check('runtime', 'app.asar found', false, 'pass --app <install dir> if the app lives elsewhere')
} else {
  const asar = openAsar(asarPath)
  const files = asar.list()
  check('runtime', `archive readable (${String(files.length)} entries)`, files.length > 0)

  const runtimeEntry = files.find((entry) => entry.path.endsWith('desktop-runtime.json'))
  const runtimeText = runtimeEntry === undefined ? undefined : asar.read(runtimeEntry.path)
  if (runtimeText === undefined) {
    check('runtime', 'desktop runtime metadata found', false, 'no desktop-runtime.json in the archive')
  } else {
    const parsed = JSON.parse(runtimeText)
    const release = parsed.release ?? parsed
    check('runtime', `DSH runtime ${String(release.version ?? '(unknown)')}`, true, `host protocol v${String(release.hostProtocolVersion ?? '?')}`)
  }

  // The shell is the largest shipped JavaScript entry; the module table is in its loader.
  // The frozen table is assembled across several shipped bundles, so every large entry is
  // searched rather than one guessed file.
  const bundles = files
    .filter((entry) => entry.path.endsWith('.js') && entry.size > 200_000)
    .sort((left, right) => right.size - left.size)
    .slice(0, 8)
    .map((entry) => asar.read(entry.path) ?? '')
  if (bundles.length === 0) {
    check('client', 'built client bundles found for module-table inspection', false, 'no large .js entry in the archive')
  } else {
    const together = bundles.join('\n')
    for (const module of REQUIRED_MODULES) {
      check('client', `module table carries ${module}`, together.includes(module))
    }
  }

  // 2. The right-sidebar contracts, from the shipped package's own bundle.
  const sidebar = files.find((entry) => entry.path.includes('dsh-client-ui-sidebar-right') && entry.path.endsWith('client.js'))
  const sidebarText = sidebar === undefined ? undefined : asar.read(sidebar.path)
  if (sidebarText === undefined) {
    check('slots', 'right-sidebar package found in the archive', false, 'no dsh-client-ui-sidebar-right/lib/client.js')
  } else {
    for (const slot of REQUIRED_SLOTS) {
      check('slots', `slot ${slot} declared`, sidebarText.includes(slot))
    }
  }
}

// 3. This plugin's own installation in the profile.
const installed = profileRoot === undefined ? undefined : join(profileRoot, 'node_modules', PLUGIN)
check('plugin', `profile found${profileRoot === undefined ? '' : ` (${profileRoot})`}`, profileRoot !== undefined)
check('plugin', `${PLUGIN} installed in the profile`, installed !== undefined && existsSync(installed))
for (const artifact of ['lib/index.js', 'lib/client.js', 'lib/typert.host.js', 'lib/typert.remote-client.js', 'cordis.patch.yml']) {
  check('plugin', `artifact ${artifact} present`, installed !== undefined && existsSync(join(installed, artifact)))
}
const remoteClient = installed === undefined ? undefined : readText(join(installed, 'lib', 'typert.remote-client.js'))
if (remoteClient !== undefined) {
  for (const endpoint of REQUIRED_ENDPOINTS) {
    check('endpoints', `${endpoint} exposed`, remoteClient.includes(endpoint))
  }
}
const profileManifest = profileRoot === undefined ? undefined : readText(join(profileRoot, 'package.json'))
if (profileManifest !== undefined) {
  const bundles = JSON.parse(profileManifest).dsh?.profile?.bundles ?? []
  check('plugin', `${PLUGIN} selected as a profile bundle`, bundles.includes(PLUGIN), bundles.join(', '))
}

// Report.
const failed = findings.filter((entry) => !entry.ok)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ appRoot, profileRoot, findings, failed: failed.length }, null, 2))
} else {
  let area = ''
  for (const entry of findings) {
    if (entry.area !== area) {
      area = entry.area
      console.log(`\n${area}`)
    }
    console.log(`  ${entry.ok ? 'ok  ' : 'FAIL'} ${entry.label}${entry.detail === '' ? '' : `  (${entry.detail})`}`)
  }
  console.log(failed.length === 0
    ? '\ncompatible: every contract this plugin depends on is present'
    : `\n${String(failed.length)} contract(s) missing — this plugin needs an update before it works here`)
}
process.exitCode = failed.length === 0 ? 0 : 1
