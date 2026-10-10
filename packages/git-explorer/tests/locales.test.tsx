// @vitest-environment jsdom
/**
 * Localization tests.
 *
 * The dictionaries are checked for parity, and the panel is rendered with a translator
 * that answers from the Chinese dictionary — which proves the wiring without switching
 * the application's own language.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GitBody } from '../src/client/GitBody'
import { en, fill, translator, zh, type MessageKey } from '../src/client/locales'
import type { GitChange, GitStatusSummary } from '../src/types'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/** One change entry. */
function change(path: string, status: GitChange['status'] = 'modified'): GitChange {
  return { path, status, index: 'M', worktree: '.', staged: true }
}

/** A status payload with one row in each of two groups. */
function summary(): GitStatusSummary {
  return {
    isRepo: true,
    root: 'L:\\source\\demo',
    rootSource: 'request',
    gitVersion: 'git version 2.53.0.windows.2',
    operation: null,
    branch: 'main',
    detached: false,
    unborn: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [change('src/app.ts')],
    unstaged: [],
    untracked: [change('notes.md', 'untracked')],
    conflicted: [],
    truncated: false,
    skipped: [],
    note: '',
  }
}

/** The bridge the panel needs, with no mutations available. */
function bridge() {
  return {
    gitStatus: async () => summary(),
    gitPing: async () => ({
      ok: true as const,
      packageVersion: '0.1.0-m5',
      gitVersion: 'git version 2.53.0.windows.2',
      cwd: 'L:\\source\\demo',
      remote: true as const,
      sessionFound: false,
      cwdSource: 'request' as const,
      note: '',
    }),
  }
}

describe('dictionaries', () => {
  it('cover exactly the same keys', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('substitute placeholders', () => {
    expect(fill(en['discard.confirm'], { count: '3' })).toBe('Discard 3 change(s)? This cannot be undone.')
    expect(fill(zh['discard.confirm'], { count: '3' })).toBe('放弃 3 处更改？此操作无法撤销。')
  })

  it('fall back to English when no translator was provided', () => {
    const t = translator(undefined)
    expect(t('group.staged')).toBe(en['group.staged'])
    expect(t('action.discard')).toBe(en['action.discard'])
  })
})

describe('localized panel', () => {
  it('renders the Chinese chrome when the namespace is translated', async () => {
    const translate = (key: MessageKey): string => zh[key]
    render(<GitBody sessionId="session-1" translate={translate} {...bridge()} />)
    await waitFor(() => {
      expect(screen.getByText(zh['group.staged'])).toBeDefined()
    })
    expect(screen.getByText(zh['group.untracked'])).toBeDefined()
    expect(screen.getByText(zh['panel.refresh'])).toBeDefined()
    expect(screen.getByPlaceholderText(zh['commit.placeholder'])).toBeDefined()
    // Git's own data is never translated.
    expect(screen.getByText('main')).toBeDefined()
    expect(screen.getByText('app.ts')).toBeDefined()
  })

  it('renders the English chrome when no translator is handed over', async () => {
    render(<GitBody sessionId="session-1" {...bridge()} />)
    await waitFor(() => {
      expect(screen.getByText(en['group.staged'])).toBeDefined()
    })
    expect(screen.getByText(en['panel.refresh'])).toBeDefined()
  })
})
