// @vitest-environment jsdom
/**
 * Diff body tests: the comparison view must render the two sides the host returned, and
 * must say so plainly when a side cannot be shown (binary, oversized) instead of drawing
 * a diff that looks complete but is not.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GitDiffBody } from '../src/client/GitDiffBody'
import type { GitFileDiff } from '../src/types'

afterEach(cleanup)

/** A complete comparison payload. */
function diff(overrides: Partial<GitFileDiff> = {}): GitFileDiff {
  return {
    path: 'src/app.ts',
    staged: false,
    oldText: 'one\n',
    newText: 'one\ntwo\n',
    binary: false,
    oversized: false,
    note: '',
    ...overrides,
  }
}

/** The tab hook the sidebar injects, with the parameters the panel would pass. */
function tabHook(params: Record<string, unknown>) {
  return () => ({ tab: { id: 'tab-1', navigation: { params } } })
}

describe('Git diff body', () => {
  it('renders both sides and the comparison label', async () => {
    render(
      <GitDiffBody
        sessionId="session-1"
        useTabInfo={tabHook({ path: 'src/app.ts', staged: false })}
        gitDiff={async () => diff()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('diff-block')).toBeDefined()
    })
    expect(screen.getByTestId('diff-old').textContent).toBe('one\n')
    expect(screen.getByTestId('diff-new').textContent).toBe('one\ntwo\n')
    expect(screen.getByText('working tree vs index')).toBeDefined()
  })

  it('labels a staged comparison as index vs HEAD', async () => {
    render(
      <GitDiffBody
        sessionId="session-1"
        useTabInfo={tabHook({ path: 'src/app.ts', staged: true })}
        gitDiff={async () => diff({ staged: true })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('index vs HEAD')).toBeDefined()
    })
  })

  it('shows a binary notice instead of a diff', async () => {
    render(
      <GitDiffBody
        sessionId="session-1"
        useTabInfo={tabHook({ path: 'logo.png' })}
        gitDiff={async () => diff({ path: 'logo.png', binary: true, note: 'the working copy is not text' })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/binary file has no text diff/i)).toBeDefined()
    })
    expect(screen.queryByTestId('diff-block')).toBeNull()
    expect(screen.getByText('the working copy is not text')).toBeDefined()
  })

  it('shows an oversized notice instead of a partial diff', async () => {
    render(
      <GitDiffBody
        sessionId="session-1"
        useTabInfo={tabHook({ path: 'big.txt' })}
        gitDiff={async () => diff({ path: 'big.txt', oversized: true })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/larger than the read cap/i)).toBeDefined()
    })
    expect(screen.queryByTestId('diff-block')).toBeNull()
  })

  it('reports a tab with no file to compare', async () => {
    render(<GitDiffBody sessionId="session-1" useTabInfo={tabHook({})} gitDiff={async () => diff()} />)
    await waitFor(() => {
      expect(screen.getByText('this diff tab has no file to compare')).toBeDefined()
    })
  })

  it('reports a bridge failure rather than rendering nothing', async () => {
    render(
      <GitDiffBody
        sessionId="session-1"
        useTabInfo={tabHook({ path: 'src/app.ts' })}
        gitDiff={async () => ({ unavailable: 'remote.git did not mount in this page' })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('remote.git did not mount in this page')).toBeDefined()
    })
  })
})
