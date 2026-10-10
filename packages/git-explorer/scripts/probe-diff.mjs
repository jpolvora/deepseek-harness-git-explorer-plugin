/**
 * Drive the host half's comparison read against a scratch repository.
 *
 * Covers the shapes a diff view has to survive: a staged change (index vs HEAD), an
 * unstaged one (work tree vs index), an untracked file (no old side), a deleted file
 * (no new side), and a binary file.
 *
 * Usage: node scripts/probe-diff.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn as nodeSpawn } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const repo = resolve(packageRoot, '../../.tools/scratch/diff')

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
// Deterministic line endings: Git for Windows would otherwise rewrite the work tree and
// make the "unchanged" side differ from the fixture's own bytes.
git(['config', 'core.autocrlf', 'false'])
git(['config', 'user.name', 'Probe'])
git(['config', 'user.email', 'probe@example.invalid'])
writeFileSync(resolve(repo, 'tracked.txt'), 'one\ntwo\n')
writeFileSync(resolve(repo, 'deleted.txt'), 'gone soon\n')
mkdirmaybe()
function mkdirmaybe() {
  writeFileSync(resolve(repo, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]))
}
git(['add', '.'])
git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'baseline'])

writeFileSync(resolve(repo, 'tracked.txt'), 'one\ntwo\nthree\n')
writeFileSync(resolve(repo, 'staged.txt'), 'staged line\n')
git(['add', 'staged.txt'])
writeFileSync(resolve(repo, 'staged.txt'), 'staged line\nplus a work-tree edit\n')
writeFileSync(resolve(repo, 'untracked.txt'), 'brand new\n')
rmSync(resolve(repo, 'deleted.txt'))
writeFileSync(resolve(repo, 'binary.bin'), Buffer.from([0x00, 0x03, 0x04, 0xff]))

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

/** A minimal filesystem face over node:fs, matching what the diff reader calls. */
function fsProvider() {
  return {
    async resolve(path) {
      return resolve(repo, path)
    },
    async readBytes(target, _signal, maxBytes) {
      const { readFileSync, statSync } = await import('node:fs')
      const size = statSync(target).size
      if (size > maxBytes) throw new Error(`file is larger than the read cap`)
      return new Uint8Array(readFileSync(target))
    },
  }
}

const sessionId = 'session-probe'
const ctx = new Context()
ctx.provide('subprocess', subprocessProvider())
ctx.provide('fs', fsProvider())
ctx.provide('sessions', { get: (id) => (id === sessionId ? { header: { cwd: repo } } : undefined) })

const { GitExplorerService } = await import(pathToFileURL(resolve(packageRoot, 'lib/index.js')).href)
await ctx.plugin(GitExplorerService, {
  gitPath: 'git',
  timeoutMs: 30_000,
  outputMaxBytes: 8 * 1024 * 1024,
  maxFiles: 2_000,
  maxFileBytes: 64 * 1024,
})
const service = ctx.get('git')
const signal = new AbortController().signal

let failures = 0
/** Assert one condition and report it. */
function check(label, condition, extra = '') {
  if (condition) console.log(`  ok    ${label}`)
  else {
    failures += 1
    console.log(`  FAIL  ${label}${extra === '' ? '' : ` — ${extra}`}`)
  }
}

console.log('unstaged change (work tree vs index)')
let diff = await service.fileDiff(sessionId, '', 'tracked.txt', false, false, signal)
check('old side is the index content', diff.oldText === 'one\ntwo\n', JSON.stringify(diff.oldText))
check('new side is the work-tree content', diff.newText === 'one\ntwo\nthree\n', JSON.stringify(diff.newText))

console.log('staged change (index vs HEAD)')
diff = await service.fileDiff(sessionId, '', 'staged.txt', true, false, signal)
check('old side is HEAD', diff.oldText === '', JSON.stringify(diff.oldText))
check('new side is the index content', diff.newText === 'staged line\n', JSON.stringify(diff.newText))

console.log('partially staged file')
diff = await service.fileDiff(sessionId, '', 'staged.txt', false, false, signal)
check('old side is the staged content', diff.oldText === 'staged line\n', JSON.stringify(diff.oldText))
check('new side keeps the work-tree edit', diff.newText.includes('plus a work-tree edit'), JSON.stringify(diff.newText))

console.log('untracked file')
diff = await service.fileDiff(sessionId, '', 'untracked.txt', false, true, signal)
check('there is no old side', diff.oldText === '')
check('the new side is the file', diff.newText === 'brand new\n', JSON.stringify(diff.newText))

console.log('deleted file')
diff = await service.fileDiff(sessionId, '', 'deleted.txt', false, false, signal)
check('the old side survives', diff.oldText === 'gone soon\n', JSON.stringify(diff.oldText))
check('the new side is empty', diff.newText === '', JSON.stringify(diff.newText))

console.log('binary file')
diff = await service.fileDiff(sessionId, '', 'binary.bin', false, false, signal)
check('reported as binary', diff.binary, JSON.stringify(diff))

console.log('oversized file')
const { writeFileSync: write } = await import('node:fs')
write(resolve(repo, 'big.txt'), `${'x'.repeat(200 * 1024)}\n`)
diff = await service.fileDiff(sessionId, '', 'big.txt', false, true, signal)
check('reported as oversized rather than truncated', diff.oversized, JSON.stringify(diff).slice(0, 200))

console.log(failures === 0 ? '\nall diff checks passed' : `\n${String(failures)} diff check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
