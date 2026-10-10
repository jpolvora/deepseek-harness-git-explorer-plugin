/**
 * Render the panel body outside the browser with realistic host payloads.
 *
 * Catches render-time defects — the class of bug that shows up in the GUI as an empty
 * pane or a boundary message — without a reload round-trip.
 *
 * Usage: node scripts/probe-body.mjs
 */
import { renderToString } from 'react-dom/server'
import React from 'react'

const { GitBody } = await import('../lib/types/client/GitBody.js')

/** A complete status payload, shaped exactly like the host's answer. */
function summary(overrides = {}) {
  return {
    isRepo: true,
    root: 'L:\\source\\demo',
    rootSource: 'header',
    gitVersion: 'git version 2.53.0.windows.2',
    operation: null,
    branch: 'main',
    detached: false,
    unborn: false,
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    staged: [
      { path: 'src/app.ts', status: 'modified', index: 'M', worktree: '.', staged: true },
      { path: 'docs/new file.md', status: 'added', index: 'A', worktree: '.', staged: true },
    ],
    unstaged: [
      { path: 'src/other.ts', status: 'modified', index: '.', worktree: 'M', staged: false },
      { path: 'old.txt', status: 'deleted', index: '.', worktree: 'D', staged: false },
    ],
    untracked: [
      { path: 'notes.md', status: 'untracked', index: '?', worktree: '?', staged: false },
      { path: 'deep/nested/file.txt', status: 'untracked', index: '?', worktree: '?', staged: false },
    ],
    conflicted: [
      { path: 'src/conflict.ts', status: 'conflicted', index: 'U', worktree: 'U', staged: false },
    ],
    truncated: false,
    skipped: [],
    note: '',
    ...overrides,
  }
}

/** An async bridge answering with the given value, as the slot factory does. */
function bridge(value) {
  return {
    gitStatus: async () => value,
    gitPing: async () => ({
      ok: true,
      packageVersion: '0.1.0-m1',
      gitVersion: 'git version 2.53.0.windows.2',
      cwd: 'L:\\source\\demo',
      remote: true,
      sessionFound: false,
      cwdSource: 'request',
      note: '',
    }),
  }
}

const cases = [
  ['loading (no bridge)', { sessionId: 'session-1' }],
  ['bridge unavailable', { sessionId: 'session-1', ...bridge({ unavailable: 'remote.git did not mount in this page' }) }],
  ['full status', { sessionId: 'session-1', ...bridge(summary()) }],
  ['clean tree', { sessionId: 'session-1', ...bridge(summary({ staged: [], unstaged: [], untracked: [], conflicted: [], upstream: null })) }],
  ['detached', { sessionId: 'session-1', ...bridge(summary({ branch: null, detached: true })) }],
  ['unborn', { sessionId: 'session-1', ...bridge(summary({ branch: null, unborn: true })) }],
  ['merge in progress', { sessionId: 'session-1', ...bridge(summary({ operation: 'merge' })) }],
  ['not a repository', { sessionId: 'session-1', ...bridge(summary({ isRepo: false, rootSource: 'request', note: 'fatal: not a git repository' })) }],
  ['host refused the call', { sessionId: 'session-1', ...bridge({ unavailable: 'git/output-too-large' }) }],
]

let failures = 0
for (const [label, props] of cases) {
  try {
    const html = renderToString(React.createElement(GitBody, props))
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    console.log(`OK   ${label.padEnd(22)} ${String(html.length).padStart(5)} chars | ${text.slice(0, 100)}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL ${label.padEnd(22)} ${error instanceof Error ? error.message : String(error)}`)
  }
}
console.log(failures === 0 ? '\nall render cases passed' : `\n${String(failures)} render case(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
