/**
 * Drive the built host service against a real directory, outside the app.
 *
 * This is the M1 host-side acceptance check: it constructs the real service with a
 * real Cordis Context carrying a `subprocess` provider backed by node:child_process,
 * a `sessions` provider returning one fixed working directory, and then prints the
 * status summary the panel would render.
 *
 * Usage: node scripts/probe-status.mjs <directory> [sessionId] [--json]
 */
import { spawn as nodeSpawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const target = process.argv[2]
const sessionId = process.argv[3] ?? 'session-probe'
const asJson = process.argv.includes('--json')

if (target === undefined) {
  console.error('usage: node scripts/probe-status.mjs <directory> [sessionId] [--json]')
  process.exit(2)
}

/** A `subprocess` provider implementing the spec shape the service uses. */
function subprocessProvider() {
  return {
    spawn(spec) {
      const child = nodeSpawn(spec.argv[0], spec.argv.slice(1), {
        cwd: spec.cwd,
        env: { ...process.env, ...(spec.env ?? {}) },
        windowsHide: true,
      })
      const out = []
      const err = []
      child.stdout.on('data', (chunk) => out.push(chunk))
      child.stderr.on('data', (chunk) => err.push(chunk))
      const stdin = spec.stdio?.stdin
      if (stdin !== undefined && typeof stdin === 'object' && typeof stdin.data === 'string') child.stdin.end(stdin.data)
      else child.stdin.end()
      const done = new Promise((settle) => {
        child.on('close', (code) => settle({ exitCode: code }))
        child.on('error', () => settle({ exitCode: -1 }))
      })
      spec.signal?.addEventListener('abort', () => child.kill())
      const read = (chunks) => ({ readFrom: () => ({ text: Buffer.concat(chunks).toString('utf8'), lossy: false }) })
      return { done, collected: { stdout: read(out), stderr: read(err) } }
    },
  }
}

const ctx = new Context()
ctx.provide('subprocess', subprocessProvider())
ctx.provide('sessions', { get: (id) => (id === sessionId ? { header: { cwd: target } } : undefined) })

const { GitExplorerService } = await import(pathToFileURL(resolve(packageRoot, 'lib/index.js')).href)

// Apply the plugin the way the loader does, then read the service back through the
// unguarded accessor: this exercises Cordis's "cannot get property … without inject"
// guard, which a hand-constructed instance would bypass.
await ctx.plugin(GitExplorerService, {
  gitPath: 'git',
  timeoutMs: 30_000,
  outputMaxBytes: 8 * 1024 * 1024,
  maxFiles: 2_000,
})
const service = ctx.get('git')
if (service === undefined) {
  console.error('the plugin did not register a `git` service')
  process.exit(1)
}

const summary = await service.status(sessionId, '', new AbortController().signal)

if (asJson) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(`root        ${summary.root ?? '(none)'}  [${summary.rootSource}]`)
  console.log(`repo        ${summary.isRepo ? 'yes' : 'no'}   git ${summary.gitVersion ?? '(not found)'}`)
  console.log(`branch      ${summary.branch ?? (summary.detached ? '(detached)' : summary.unborn ? '(unborn)' : '(none)')}`
    + `${summary.upstream === null ? '' : ` → ${summary.upstream} ↑${summary.ahead} ↓${summary.behind}`}`
    + `${summary.operation === null ? '' : `  [${summary.operation} in progress]`}`)
  for (const [title, changes] of [
    ['staged', summary.staged],
    ['changes', summary.unstaged],
    ['untracked', summary.untracked],
    ['conflicted', summary.conflicted],
  ]) {
    if (changes.length === 0) continue
    console.log(`${title}:`)
    for (const change of changes) {
      console.log(`  ${change.status.padEnd(11)} ${change.path}${change.origPath === undefined ? '' : `  ← ${change.origPath}`}`)
    }
  }
  if (summary.note !== '') console.log(`note        ${summary.note}`)
  if (summary.skipped.length > 0) console.log(`skipped     ${summary.skipped.join(' | ')}`)
}
