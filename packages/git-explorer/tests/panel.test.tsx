// @vitest-environment jsdom
/**
 * Panel render tests.
 *
 * These run the component the way the sidebar does — effects included — against the
 * payload shapes the host returns, and against the tree the panel draws from them. They
 * exist because the first M1 panel read its fields off the Remote envelope instead of
 * the payload and rendered as an empty pane with no visible error; a test that waits for
 * the read to settle catches that in a second instead of a reload.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GitBody } from '../src/client/GitBody'
import type { GitChange, GitStatusSummary } from '../src/types'

// Vitest runs without globals, so the library's automatic cleanup never registers;
// without this, each render stays in the document and text queries match twice.
afterEach(cleanup)

/** One change entry. */
function change(path: string, status: GitChange['status'] = 'modified', extra: Partial<GitChange> = {}): GitChange {
  return { path, status, index: 'M', worktree: '.', staged: true, ...extra }
}

/** A complete status payload. */
function summary(overrides: Partial<GitStatusSummary> = {}): GitStatusSummary {
  return {
    isRepo: true,
    root: 'L:\\source\\demo',
    rootSource: 'request',
    gitVersion: 'git version 2.53.0.windows.2',
    operation: null,
    branch: 'main',
    detached: false,
    unborn: false,
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    staged: [change('src/app.ts'), change('src/lib/util.ts')],
    unstaged: [change('src/other.ts', 'modified', { index: '.', worktree: 'M', staged: false })],
    untracked: [change('notes.md', 'untracked', { index: '?', worktree: '?', staged: false })],
    conflicted: [],
    truncated: false,
    skipped: [],
    note: '',
    ...overrides,
  }
}

/** The business face the slot factory would hand the body. */
function bridge(value: GitStatusSummary | { unavailable: string }) {
  return {
    gitStatus: async () => value,
    gitPing: async () => ({
      ok: true as const,
      packageVersion: '0.1.0-m1.4',
      gitVersion: 'git version 2.53.0.windows.2',
      cwd: 'L:\\source\\demo',
      remote: true as const,
      sessionFound: false,
      cwdSource: 'request' as const,
      note: '',
    }),
  }
}

describe('Git panel', () => {
  it('renders the branch line, the grouped tree and the diagnostics', async () => {
    render(<GitBody sessionId="session-1" {...bridge(summary())} />)
    await waitFor(() => {
      expect(screen.getByText('main')).toBeDefined()
    })
    expect(screen.getByText('↑2 ↓1')).toBeDefined()
    expect(screen.getByText('Staged changes')).toBeDefined()
    expect(screen.getByText('Changes')).toBeDefined()
    expect(screen.getByText('Untracked')).toBeDefined()
    // Files nest under their directory row, so the tree shows the directory once.
    expect(screen.getAllByText('src').length).toBeGreaterThan(0)
    expect(screen.getByText('app.ts')).toBeDefined()
    expect(screen.getByText('lib')).toBeDefined()
    expect(screen.getByText('util.ts')).toBeDefined()
    expect(screen.getByText('plugin build')).toBeDefined()
    expect(screen.getByText('0.1.0-m1.4')).toBeDefined()
  })

  it('collapses a directory when its row is clicked', async () => {
    render(<GitBody sessionId="session-1" {...bridge(summary())} />)
    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeDefined()
    })
    fireEvent.click(screen.getAllByText('src')[0])
    await waitFor(() => {
      expect(screen.queryByText('app.ts')).toBeNull()
    })
    // The untracked file elsewhere in the panel survives.
    expect(screen.getByText('notes.md')).toBeDefined()
  })

  it('collapses a whole group when its header is clicked', async () => {
    render(<GitBody sessionId="session-1" {...bridge(summary())} />)
    await waitFor(() => {
      expect(screen.getByText('notes.md')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Untracked'))
    await waitFor(() => {
      expect(screen.queryByText('notes.md')).toBeNull()
    })
  })

  it('renders a rename with its original name beside the new one', async () => {
    render(
      <GitBody
        sessionId="session-1"
        {...bridge(summary({
          staged: [change('docs/new.md', 'renamed', { index: 'R', origPath: 'docs/old.md', renameScore: 100 })],
          unstaged: [],
          untracked: [],
        }))}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('new.md')).toBeDefined()
    })
    expect(screen.getByText('old.md')).toBeDefined()
  })

  it('renders the not-a-repository state with the git note', async () => {
    render(
      <GitBody
        sessionId="session-1"
        {...bridge(summary({ isRepo: false, branch: null, note: 'fatal: not a git repository' }))}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/Not a git repository/)).toBeDefined()
    })
    expect(screen.getAllByText('fatal: not a git repository').length).toBeGreaterThan(0)
  })

  it('says so when the tree is clean', async () => {
    render(<GitBody sessionId="session-1" {...bridge(summary({ staged: [], unstaged: [], untracked: [] }))} />)
    await waitFor(() => {
      expect(screen.getByText(/working tree is clean/)).toBeDefined()
    })
  })

  it('renders a bridge failure instead of an empty pane', async () => {
    render(<GitBody sessionId="session-1" {...bridge({ unavailable: 'remote.git did not mount in this page' })} />)
    await waitFor(() => {
      expect(screen.getByText('remote.git did not mount in this page')).toBeDefined()
    })
  })

  it('reports a missing bridge instead of rendering an empty pane', async () => {
    render(<GitBody sessionId="session-1" />)
    await waitFor(() => {
      expect(screen.getByText('the host bridge is not mounted on this tab')).toBeDefined()
    })
  })
})
