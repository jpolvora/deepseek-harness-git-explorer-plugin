/**
 * Drive the agent tools against a scratch repository, outside the app.
 *
 * The plugin is applied through a real Cordis context with a stub `tools` registry that
 * records every definition, so this exercises the real registration path (inject, schema,
 * execute, render) and then calls each handler the way the model would.
 *
 * Usage: node scripts/probe-tools.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn as nodeSpawn } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const repo = resolve(packageRoot, '../../.tools/scratch/tools')

/** Run git for the fixture setup, loudly. */
function git(args) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

rmSync(repo, { recursive: true, force: true })
mkdirSync(repo, { recursive: true })
git(['init', '-q', '-b', 'main'])
git(['config', 'core.autocrlf', 'false'])
git(['config', 'user.name', 'Probe'])
git(['config', 'user.email', 'probe@example.invalid'])
writeFileSync(resolve(repo, 'tracked.txt'), 'one\n')
git(['add', '.'])
git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'baseline commit'])
writeFileSync(resolve(repo, 'tracked.txt'), 'one\ntwo\n')
writeFileSync(resolve(repo, 'fresh.txt'), 'brand new\n')

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
      child.stdin.end()
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

/** The stub registry: it records the definitions the plugin registers. */
const registered = new Map()
const tools = {
  register(definition) {
    registered.set(definition.name, definition)
    return () => registered.delete(definition.name)
  },
}

const sessionId = 'session-probe'
const ctx = new Context()
ctx.provide('subprocess', subprocessProvider())
ctx.provide('tools', tools)
// The diff reader reads the work-tree side through the filesystem capability.
ctx.provide('fs', {
  async resolve(path) {
    return resolve(repo, path)
  },
  async readBytes(target, _signal, maxBytes) {
    const { readFileSync, statSync } = await import('node:fs')
    if (statSync(target).size > maxBytes) throw new Error('file is larger than the read cap')
    return new Uint8Array(readFileSync(target))
  },
})
ctx.provide('sessions', { get: (id) => (id === sessionId ? { header: { cwd: repo } } : undefined) })

const { GitExplorerService } = await import(pathToFileURL(resolve(packageRoot, 'lib/index.js')).href)
await ctx.plugin(GitExplorerService, {
  gitPath: 'git',
  timeoutMs: 30_000,
  outputMaxBytes: 8 * 1024 * 1024,
  maxFiles: 2_000,
  maxFileBytes: 2 * 1024 * 1024,
})

let failures = 0
/** Assert one condition and report it. */
function check(label, condition, extra = '') {
  if (condition) console.log(`  ok    ${label}`)
  else {
    failures += 1
    console.log(`  FAIL  ${label}${extra === '' ? '' : ` — ${extra}`}`)
  }
}

console.log('registration')
check(`three tools registered (${[...registered.keys()].join(', ')})`, registered.size === 3)
for (const name of ['git_status', 'git_diff', 'git_log']) {
  const definition = registered.get(name)
  check(`${name} has a description and an output`, typeof definition?.description === 'string' && definition?.output?.schema !== undefined)
}

/** Call one tool the way the pipeline does. */
async function call(name, args) {
  const definition = registered.get(name)
  const value = await definition.execute(args, {
    signal: new AbortController().signal,
    agent: { session: { id: sessionId } },
  })
  return JSON.parse(value)
}

console.log('git_status')
const status = await call('git_status', {})
check('reports the branch', status.branch === 'main', JSON.stringify(status.branch))
check('lists the modified file', status.changes.unstaged.some((entry) => entry.path === 'tracked.txt'), JSON.stringify(status.changes.unstaged))
check('lists the untracked file', status.changes.untracked.some((entry) => entry.path === 'fresh.txt'))

console.log('git_diff')
const diff = await call('git_diff', { path: 'tracked.txt' })
check('returns a patch with the added line', typeof diff.patch === 'string' && diff.patch.includes('+two'), JSON.stringify(diff).slice(0, 160))
const untrackedDiff = await call('git_diff', { path: 'fresh.txt', untracked: true })
check('reports an untracked file as all added', untrackedDiff.added === 'brand new\n', JSON.stringify(untrackedDiff))
const stagedDiff = await call('git_diff', { path: 'tracked.txt', staged: true })
check('a staged comparison of an unstaged file is empty', stagedDiff.patch === '')

console.log('git_log')
const log = await call('git_log', { limit: 5 })
check('returns the baseline commit', log.commits.length === 1 && log.commits[0]?.subject === 'baseline commit', JSON.stringify(log.commits))
check('each commit carries its author and date', typeof log.commits[0]?.author === 'string' && typeof log.commits[0]?.date === 'string')

console.log('a call without a session')
const orphan = await (async () => {
  const definition = registered.get('git_status')
  return JSON.parse(await definition.execute({}, { signal: new AbortController().signal }))
})()
check('answers with an error instead of throwing', typeof orphan.error === 'string', JSON.stringify(orphan))

console.log(failures === 0 ? '\nall tool checks passed' : `\n${String(failures)} tool check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
