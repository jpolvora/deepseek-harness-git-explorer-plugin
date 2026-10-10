/**
 * Drive the host half's mutating verbs against a scratch repository, outside the app.
 *
 * The plugin is applied through a real Cordis context (so the inject guard, the service
 * registration and the Remote metadata are all exercised) and every step asserts the
 * repository's real state afterwards.
 *
 * Usage: node scripts/probe-mutations.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { spawn as nodeSpawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const repo = resolve(packageRoot, '../../.tools/scratch/mutations')

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
// Deterministic line endings: Git for Windows defaults to core.autocrlf=true, which
// rewrites work-tree files on checkout and would make "the file matches HEAD" depend on
// the fixture's own newlines rather than on the verb under test.
git(['config', 'core.autocrlf', 'false'])
git(['config', 'core.safecrlf', 'false'])
git(['-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'config', 'user.name', 'Probe'])
git(['config', 'user.email', 'probe@example.invalid'])
writeFileSync(resolve(repo, 'tracked.txt'), 'one\n')
git(['add', 'tracked.txt'])
git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'baseline'])
writeFileSync(resolve(repo, 'tracked.txt'), 'one\ntwo\n')
writeFileSync(resolve(repo, 'untracked.txt'), 'fresh\n')

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

const sessionId = 'session-probe'
const ctx = new Context()
ctx.provide('subprocess', subprocessProvider())
ctx.provide('sessions', { get: (id) => (id === sessionId ? { header: { cwd: repo } } : undefined) })

const { GitExplorerService } = await import(pathToFileURL(resolve(packageRoot, 'lib/index.js')).href)
await ctx.plugin(GitExplorerService, {
  gitPath: 'git',
  timeoutMs: 30_000,
  outputMaxBytes: 8 * 1024 * 1024,
  maxFiles: 2_000,
})
const service = ctx.get('git')

const signal = new AbortController().signal
let failures = 0

/** Assert one condition and report it. */
function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ok    ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${label}${extra === '' ? '' : ` — ${extra}`}`)
  }
}

/** Read the status the panel would render. */
async function status() {
  return await service.status(sessionId, '', signal)
}

console.log('baseline')
let current = await status()
check('one unstaged change', current.unstaged.length === 1, JSON.stringify(current.unstaged))
check('one untracked file', current.untracked.length === 1, JSON.stringify(current.untracked))

console.log('stage')
let outcome = await service.stage(sessionId, '', ['tracked.txt'], signal)
check(`stage reported ok (${outcome.detail})`, outcome.ok)
current = await status()
check('the file is staged and no longer unstaged', current.staged.length === 1 && current.unstaged.length === 0)

console.log('unstage')
outcome = await service.unstage(sessionId, '', ['tracked.txt'], signal)
check(`unstage reported ok (${outcome.detail})`, outcome.ok)
current = await status()
check('the file is unstaged again', current.staged.length === 0 && current.unstaged.length === 1)

console.log('discard without confirmation')
outcome = await service.discard(sessionId, '', ['tracked.txt'], [], false, signal)
check('refused', !outcome.ok, outcome.detail)

console.log('discard with confirmation')
outcome = await service.discard(sessionId, '', ['tracked.txt'], [], true, signal)
check(`discard reported ok (${outcome.detail})`, outcome.ok)
console.log('    diff:', JSON.stringify(git(['diff'])))
console.log('    diff --cached:', JSON.stringify(git(['diff', '--cached'])))
console.log('    content:', JSON.stringify(git(['show', 'HEAD:tracked.txt'])), '→', JSON.stringify(await import('node:fs').then((fs) => fs.readFileSync(resolve(repo, 'tracked.txt'), 'utf8'))))
check(
  'the work tree matches HEAD again',
  git(['status', '--porcelain']).trim() === '?? untracked.txt',
  JSON.stringify(git(['status', '--porcelain'])),
)

console.log('discard an untracked file')
outcome = await service.discard(sessionId, '', [], ['untracked.txt'], true, signal)
check(`discard reported ok (${outcome.detail})`, outcome.ok)
check('the untracked file is gone', git(['status', '--porcelain']).trim() === '', JSON.stringify(git(['status', '--porcelain'])))

console.log('commit')
outcome = await service.commit(sessionId, '', '', false, signal)
check('an empty message is refused', !outcome.ok, outcome.detail)
writeFileSync(resolve(repo, 'tracked.txt'), 'one\ntwo\nthree\n')
await service.stage(sessionId, '', ['tracked.txt'], signal)
outcome = await service.commit(sessionId, '', 'probe: add a third line', false, signal)
check(`commit reported ok (${outcome.detail})`, outcome.ok)
check('HEAD advanced', git(['log', '--oneline']).trim().split('\n').length === 2)
check('the tree is clean', git(['status', '--porcelain']).trim() === '')

console.log('amend')
writeFileSync(resolve(repo, 'tracked.txt'), 'one\ntwo\nthree\nfour\n')
await service.stage(sessionId, '', ['tracked.txt'], signal)
outcome = await service.commit(sessionId, '', 'probe: amend to four lines', true, signal)
check(`amend reported ok (${outcome.detail})`, outcome.ok)
check('HEAD did not advance', git(['log', '--oneline']).trim().split('\n').length === 2)

console.log(failures === 0 ? '\nall mutation checks passed' : `\n${String(failures)} mutation check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
