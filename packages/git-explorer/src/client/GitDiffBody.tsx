/**
 * The comparison view for one changed file.
 *
 * The host hands over both sides of the change (not a patch), and the shipped
 * `DiffBlock` primitive computes the unified diff — the same renderer the transcript's
 * edit cards use, so a diff looks the same wherever it appears in the product.
 *
 * The tab is opened with `params: { path, staged, untracked }`, which is how the panel
 * tells this body what to compare.
 */
import * as React from 'react'
import { DiffBlock, diffTotals } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitFileDiffOutcome } from '../types.js'

/** The tab-information hook the sidebar injects into every tab body. */
type TabInfoHook = () => {
  tab: {
    id: string
    navigation: { params?: Record<string, unknown> }
  }
}

/** Props the framework and this plugin's business face deliver to the diff body. */
export interface GitDiffBodyProps {
  /** The Session the tab belongs to. */
  sessionId?: string
  /** Framework hook: the tab's own navigation parameters. */
  useTabInfo?: TabInfoHook
  /** The comparison read, contributed through the slot's `inject` face factory. */
  gitDiff?: (
    path: string,
    staged: boolean,
    untracked: boolean,
    signal: AbortSignal,
  ) => Promise<GitFileDiffOutcome>
}

/** Localized chrome for the diff primitive; the product's own words are reused. */
const LABELS = {
  codeLabel: 'text',
  wrapLabel: 'Wrap lines',
  unwrapLabel: 'Preserve columns',
  copy: 'Copy',
  copied: 'Copied',
  collapseAria: 'Collapse the unchanged lines',
  expandAria: (hidden: number) => `Expand ${String(hidden)} hidden lines`,
  collapse: 'Collapse',
  expand: (hidden: number) => `Expand ${String(hidden)} lines`,
}

/** A read-only line of chrome above the diff. */
function Header({ text, tone }: { text: string; tone?: string }): React.ReactElement {
  return <div style={{ color: tone ?? 'var(--dsw-alias-label-secondary)', paddingBottom: '6px' }}>{text}</div>
}

/**
 * Render the comparison.
 *
 * @param props - the session, the tab hook and the host bridge.
 * @returns the diff body.
 */
export function GitDiffBody({ useTabInfo, gitDiff }: GitDiffBodyProps): React.ReactElement {
  const params = useTabInfo?.().tab.navigation.params
  const path = typeof params?.path === 'string' ? params.path : ''
  const staged = params?.staged === true
  const untracked = params?.untracked === true
  const [outcome, setOutcome] = React.useState<GitFileDiffOutcome | null>(null)

  const bridge = React.useRef<GitDiffBodyProps['gitDiff']>(gitDiff)
  bridge.current = gitDiff

  React.useEffect(() => {
    const read = bridge.current
    if (read === undefined) {
      setOutcome({ unavailable: 'the host bridge is not mounted on this tab' })
      return
    }
    if (path === '') {
      setOutcome({ unavailable: 'this diff tab has no file to compare' })
      return
    }
    const abort = new AbortController()
    let live = true
    void read(path, staged, untracked, abort.signal).then(
      (result) => {
        if (live) setOutcome(result)
      },
      (error: unknown) => {
        if (live) setOutcome({ unavailable: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      live = false
      abort.abort()
    }
  }, [path, staged, untracked])

  if (outcome === null) return <div style={{ padding: '10px 12px' }}><Header text="Reading the diff…" /></div>
  if ('unavailable' in outcome) {
    return (
      <div style={{ padding: '10px 12px', color: 'var(--dsw-alias-state-error-primary)' }}>
        {outcome.unavailable}
      </div>
    )
  }

  const diff = outcome
  const totals = diff.binary || diff.oversized ? null : diffTotals([{ path: diff.path, oldText: diff.oldText, newText: diff.newText }])

  return (
    <div style={{ padding: '10px 12px', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', paddingBottom: '6px' }}>
        <span style={{ fontWeight: 600, wordBreak: 'break-all' }}>{diff.path}</span>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>
          {staged ? 'index vs HEAD' : 'working tree vs index'}
        </span>
        {totals === null
          ? null
          : (
            <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-secondary)' }}>
              {`+${String(totals.added)} −${String(totals.removed)}`}
            </span>
          )}
      </div>
      {diff.binary
        ? <Header text="A binary file has no text diff." tone="var(--dsw-alias-state-warn-label)" />
        : null}
      {diff.oversized
        ? <Header text="One side is larger than the read cap, so no diff is shown." tone="var(--dsw-alias-state-warn-label)" />
        : null}
      {diff.note === '' ? null : <Header text={diff.note} />}
      {diff.binary || diff.oversized
        ? null
        : (
          <DiffBlock
            diffs={[{ path: diff.path, oldText: diff.oldText, newText: diff.newText }]}
            labels={LABELS}
          />
        )}
    </div>
  )
}
