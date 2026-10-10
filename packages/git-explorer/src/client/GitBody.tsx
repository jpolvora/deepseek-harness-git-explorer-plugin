/**
 * The Git panel body — the read-only Source Control view.
 *
 * Each group renders its changes as a directory tree, following the shape VS Code's
 * Source Control view uses: one row per (compacted) directory with a chevron, files
 * nested underneath with a file-type glyph, and the status letter right-aligned. The
 * grouping itself lives in `change-tree.ts` so it is unit-testable on its own.
 *
 * Styling note: this file uses inline styles over the documented `--dsw-alias-*` tokens.
 * Moving to CSS Modules with the shipped primitives is a separate step, because plugin
 * CSS is inlined at build time and the markup has to change in one go.
 */
import * as React from 'react'
import {
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  classifyFileType,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { buildChangeTree, type ChangeTreeNode } from './change-tree.js'
import type {
  GitChange,
  GitFileStatus,
  GitPingOutcome,
  GitStatusOutcome,
  GitStatusSummary,
} from '../types.js'

/** The session list face the framework hands a session-scoped body. */
type SessionsHook = <T>(select: (state: SessionListState) => T) => T

/** The slice of the client session store this panel reads. */
interface SessionListState {
  byId: Record<string, { cwd?: string } | undefined>
}

/** Props the framework and this plugin's business face deliver to the body. */
export interface GitBodyProps {
  /** The Session the tab belongs to, delivered by the sidebar's render call. */
  sessionId?: string
  /** The client session store, part of the session standard kit. */
  useSessions?: SessionsHook
  /** The status read, contributed through the slot's `inject` face factory. */
  gitStatus?: (requestRoot: string, signal: AbortSignal) => Promise<GitStatusOutcome>
  /** The diagnostic probe, contributed through the same factory. */
  gitPing?: (requestRoot: string, signal: AbortSignal) => Promise<GitPingOutcome>
}

/** How one status letter reads in the row badge. */
const STATUS_LETTER: Record<GitFileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
  conflicted: 'U',
  untracked: 'U',
}

/** The tone each status letter carries, matching VS Code's reading of the states. */
const STATUS_TONE: Record<GitFileStatus, string> = {
  modified: 'var(--dsw-alias-state-warn-label)',
  added: 'var(--dsw-alias-state-success-primary)',
  deleted: 'var(--dsw-alias-state-error-primary)',
  renamed: 'var(--dsw-alias-state-business-primary)',
  copied: 'var(--dsw-alias-state-business-primary)',
  typechange: 'var(--dsw-alias-state-warn-label)',
  conflicted: 'var(--dsw-alias-state-error-primary)',
  untracked: 'var(--dsw-alias-state-success-primary)',
}

/** The muted tokens the panel draws its secondary text with. */
const SECONDARY = 'var(--dsw-alias-label-secondary)'
const TERTIARY = 'var(--dsw-alias-label-tertiary)'

/** Indent one nesting level. */
const INDENT_PX = 14

/** The localStorage key holding this tab's collapsed groups and directories. */
const COLLAPSE_KEY_PREFIX = 'dsh.git-explorer.collapsed.v1.'

/** One label/value diagnostic line. */
function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '1px 0' }}>
      <span style={{ minWidth: '104px', color: TERTIARY }}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

/** The shared geometry of one tree row. */
function rowStyle(depth: number, hovered: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '1px 4px',
    paddingLeft: `${String(4 + depth * INDENT_PX)}px`,
    background: hovered ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
    boxSizing: 'border-box',
  }
}

/** A directory row: chevron, folder glyph, compacted label. */
function DirectoryRow({ node, depth, collapsed, onToggle }: {
  node: ChangeTreeNode
  depth: number
  collapsed: ReadonlySet<string>
  onToggle: (path: string) => void
}): React.ReactElement {
  const isCollapsed = collapsed.has(node.path)
  const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular
  const Folder = isCollapsed ? IconFolderCloseRegular : IconFolderOpenRegular
  return (
    <div
      role="treeitem"
      aria-expanded={!isCollapsed}
      onClick={() => { onToggle(node.path) }}
      style={rowStyle(depth, false)}
    >
      <Chevron size={16} />
      <Folder size={16} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
    </div>
  )
}

/** A file row: glyph, name, right-aligned status letter. */
function FileRow({ node, depth, hovered, onHover }: {
  node: ChangeTreeNode
  depth: number
  hovered: boolean
  onHover: (path: string | undefined) => void
}): React.ReactElement {
  const change = node.change
  if (change === undefined) {
    // Unreachable by construction; rendering the name beats rendering nothing.
    return <div style={rowStyle(depth, false)}><span>{node.name}</span></div>
  }
  return (
    <div
      role="treeitem"
      title={change.origPath === undefined ? change.path : `${change.origPath} → ${change.path}`}
      onMouseEnter={() => { onHover(change.path) }}
      onMouseLeave={() => { onHover(undefined) }}
      style={rowStyle(depth, hovered)}
    >
      <span style={{ width: 16, flexShrink: 0 }} />
      <FileTypeIcon kind={classifyFileType(node.name)} size={16} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.name}
      </span>
      {change.origPath === undefined
        ? null
        : <span style={{ color: TERTIARY, flexShrink: 0 }}>{change.origPath.split('/').pop()}</span>}
      <span style={{ color: STATUS_TONE[change.status], flexShrink: 0, paddingLeft: '6px' }}>
        {STATUS_LETTER[change.status]}
      </span>
    </div>
  )
}

/** Rows for one level, recursing into directories that are expanded. */
function TreeRows({ nodes, depth, collapsed, onToggle, hovered, onHover }: {
  nodes: readonly ChangeTreeNode[]
  depth: number
  collapsed: ReadonlySet<string>
  onToggle: (path: string) => void
  hovered: string | undefined
  onHover: (path: string | undefined) => void
}): React.ReactElement {
  return (
    <>
      {nodes.map((node) => node.kind === 'directory'
        ? (
          <React.Fragment key={`d:${node.path}`}>
            <DirectoryRow node={node} depth={depth} collapsed={collapsed} onToggle={onToggle} />
            {collapsed.has(node.path)
              ? null
              : (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  hovered={hovered}
                  onHover={onHover}
                />
              )}
          </React.Fragment>
        )
        : (
          <FileRow
            key={`f:${node.path}`}
            node={node}
            depth={depth}
            hovered={hovered === node.path}
            onHover={onHover}
          />
        ))}
    </>
  )
}

/** One collapsible group with its count badge and tree. */
function Group({ title, changes, collapsedGroups, onToggleGroup, collapsedDirs, onToggleDir, hovered, onHover }: {
  title: string
  changes: readonly GitChange[]
  collapsedGroups: ReadonlySet<string>
  onToggleGroup: (title: string) => void
  collapsedDirs: ReadonlySet<string>
  onToggleDir: (path: string) => void
  hovered: string | undefined
  onHover: (path: string | undefined) => void
}): React.ReactElement | null {
  const tree = React.useMemo(() => buildChangeTree(changes), [changes])
  if (changes.length === 0) return null
  const isCollapsed = collapsedGroups.has(title)
  const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular
  return (
    <div style={{ paddingTop: '6px' }}>
      <div onClick={() => { onToggleGroup(title) }} style={{ ...rowStyle(0, false), gap: '4px' }}>
        <Chevron size={16} />
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{
          marginLeft: 'auto',
          background: 'var(--dsw-alias-bg-layer-3)',
          borderRadius: '8px',
          color: SECONDARY,
          fontSize: '0.85em',
          padding: '0 6px',
        }}>
          {changes.length}
        </span>
      </div>
      {isCollapsed
        ? null
        : (
          <TreeRows
            nodes={tree}
            depth={1}
            collapsed={collapsedDirs}
            onToggle={onToggleDir}
            hovered={hovered}
            onHover={onHover}
          />
        )}
    </div>
  )
}

/** The branch line: branch name, tracking drift and the repository root. */
function BranchLine({ status }: { status: GitStatusSummary }): React.ReactElement {
  const branch = status.branch ?? (status.detached ? '(detached HEAD)' : status.unborn ? '(no commits yet)' : '(unknown)')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{branch}</span>
        {status.upstream === null
          ? null
          : <span style={{ color: SECONDARY }}>{`↑${String(status.ahead)} ↓${String(status.behind)}`}</span>}
        {status.operation === null
          ? null
          : <span style={{ color: 'var(--dsw-alias-state-warn-label)' }}>{`${status.operation} in progress`}</span>}
      </div>
      {status.root === null ? null : <div style={{ color: TERTIARY, wordBreak: 'break-all' }}>{status.root}</div>}
    </div>
  )
}

/** The panel's own small button, token-styled. */
function Action({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid var(--dsw-alias-border-l3)',
        borderRadius: '4px',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        font: 'inherit',
        padding: '1px 8px',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

/**
 * Catch a render failure and show it.
 *
 * A tab whose body throws renders as an empty pane, which reads as "the feature is
 * broken" with no clue why. This boundary turns that into a visible line.
 */
class PanelBoundary extends React.Component<{ children: React.ReactNode }, { failure: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { failure: null }
  }

  static getDerivedStateFromError(error: unknown): { failure: string } {
    return { failure: error instanceof Error ? error.message : String(error) }
  }

  override render(): React.ReactNode {
    if (this.state.failure !== null) {
      return (
        <div style={{ padding: '10px 12px', color: 'var(--dsw-alias-state-error-primary)' }}>
          {`The Git panel failed to render: ${this.state.failure}`}
        </div>
      )
    }
    return this.props.children
  }
}

/** Read this tab's collapsed groups and directories. */
function readCollapsed(sessionId: string | undefined): { groups: string[]; directories: string[] } {
  if (sessionId === undefined) return { groups: [], directories: [] }
  try {
    const raw = window.localStorage.getItem(`${COLLAPSE_KEY_PREFIX}${sessionId}`)
    if (raw === null) return { groups: [], directories: [] }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { groups: [], directories: [] }
    const value = parsed as { groups?: unknown; directories?: unknown }
    return {
      groups: Array.isArray(value.groups) ? value.groups.filter((item): item is string => typeof item === 'string') : [],
      directories: Array.isArray(value.directories) ? value.directories.filter((item): item is string => typeof item === 'string') : [],
    }
  } catch {
    // Unreadable collapse state is not worth failing a panel over.
    return { groups: [], directories: [] }
  }
}

/**
 * Render the panel.
 *
 * @param props - the session, the session store and the host bridge.
 * @returns the panel body.
 */
export function GitBody(props: GitBodyProps): React.ReactElement {
  return (
    <PanelBoundary>
      <GitPanel {...props} />
    </PanelBoundary>
  )
}

/**
 * Render the panel contents.
 *
 * @param props - the session, the session store and the host bridge.
 * @returns the panel body.
 */
function GitPanel({ sessionId, useSessions, gitStatus, gitPing }: GitBodyProps): React.ReactElement {
  const [outcome, setOutcome] = React.useState<GitStatusOutcome | null>(null)
  const [probe, setProbe] = React.useState<GitPingOutcome | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [hovered, setHovered] = React.useState<string | undefined>(undefined)
  const restored = React.useRef<{ groups: string[]; directories: string[] } | null>(null)
  if (restored.current === null) restored.current = readCollapsed(sessionId)
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<string>>(new Set(restored.current.groups))
  const [collapsedDirs, setCollapsedDirs] = React.useState<ReadonlySet<string>>(new Set(restored.current.directories))

  // The slot engine may hand a fresh business face on every render, so the callbacks
  // are read through a ref: depending on their identity in the effect below would
  // re-run the read on every render, and each state write would render again.
  const bridge = React.useRef<{ gitStatus?: GitBodyProps['gitStatus']; gitPing?: GitBodyProps['gitPing'] }>({})
  bridge.current = { gitStatus, gitPing }

  // The client's own view of the session's working directory: the host prefers its own
  // Session lookup and uses this only when that lookup cannot answer.
  const sessionCwd = useSessions === undefined || sessionId === undefined
    ? undefined
    : useSessions((state) => state?.byId?.[sessionId]?.cwd)
  const requestRoot = sessionCwd ?? ''

  React.useEffect(() => {
    const readStatus = bridge.current.gitStatus
    const readProbe = bridge.current.gitPing
    if (readStatus === undefined) {
      setOutcome({ unavailable: 'the host bridge is not mounted on this tab' })
      return
    }
    const abort = new AbortController()
    let live = true
    void readStatus(requestRoot, abort.signal).then(
      (result) => {
        if (live) setOutcome(result)
      },
      (error: unknown) => {
        if (live) setOutcome({ unavailable: error instanceof Error ? error.message : String(error) })
      },
    )
    if (readProbe !== undefined) {
      void readProbe(requestRoot, abort.signal).then(
        (result) => {
          if (live) setProbe(result)
        },
        () => undefined,
      )
    }
    return () => {
      live = false
      abort.abort()
    }
  }, [requestRoot, attempt])

  /** Remember the collapse state, so a reopened tab looks the way it was left. */
  React.useEffect(() => {
    if (sessionId === undefined) return
    try {
      window.localStorage.setItem(`${COLLAPSE_KEY_PREFIX}${sessionId}`, JSON.stringify({
        groups: [...collapsedGroups],
        directories: [...collapsedDirs],
      }))
    } catch {
      // Storage is best-effort; the panel keeps working in memory.
    }
  }, [sessionId, collapsedGroups, collapsedDirs])

  /** Toggle one group's expansion. */
  const toggleGroup = (title: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }
  /** Toggle one directory's expansion. */
  const toggleDir = (path: string): void => {
    setCollapsedDirs((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const total = outcome !== null && !('unavailable' in outcome)
    ? outcome.staged.length + outcome.unstaged.length + outcome.untracked.length + outcome.conflicted.length
    : 0

  const groupProps = {
    collapsedGroups,
    onToggleGroup: toggleGroup,
    collapsedDirs,
    onToggleDir: toggleDir,
    hovered,
    onHover: setHovered,
  }

  return (
    <div style={{ padding: '10px 12px', lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        {outcome !== null && !('unavailable' in outcome) && outcome.isRepo
          ? <BranchLine status={outcome} />
          : <span style={{ fontWeight: 600 }}>Git</span>}
        <Action label="Refresh" onClick={() => { setAttempt((value) => value + 1) }} />
      </div>

      <div role="tree" style={{ paddingTop: '4px' }}>
        {outcome === null
          ? <div style={{ color: SECONDARY }}>Reading the working tree…</div>
          : 'unavailable' in outcome
            ? <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{outcome.unavailable}</div>
            : !outcome.isRepo
              ? (
                <div style={{ color: SECONDARY }}>
                  Not a git repository.
                  {outcome.note === '' ? null : <div style={{ color: TERTIARY }}>{outcome.note}</div>}
                </div>
              )
              : (
                <>
                  {outcome.conflicted.length === 0
                    ? null
                    : (
                      <div style={{ color: 'var(--dsw-alias-state-warn-label)' }}>
                        {`${String(outcome.conflicted.length)} conflicted file(s) need resolution`}
                      </div>
                    )}
                  <Group title="Staged changes" changes={outcome.staged} {...groupProps} />
                  <Group title="Changes" changes={outcome.unstaged} {...groupProps} />
                  <Group title="Conflicted" changes={outcome.conflicted} {...groupProps} />
                  <Group title="Untracked" changes={outcome.untracked} {...groupProps} />
                  {total === 0 ? <div style={{ color: SECONDARY }}>No changes — the working tree is clean.</div> : null}
                </>
              )}
      </div>

      <div
        style={{
          paddingTop: '10px',
          marginTop: '10px',
          borderTop: '1px solid var(--dsw-alias-border-l3)',
          color: TERTIARY,
        }}
      >
        <Row label="session" value={sessionId ?? '(none)'} />
        <Row label="workspace" value={requestRoot === '' ? '(unknown to the panel)' : requestRoot} />
        {outcome !== null && !('unavailable' in outcome)
          ? (
            <>
              <Row label="root source" value={outcome.rootSource} />
              <Row label="git" value={outcome.gitVersion ?? '(not found)'} />
              {outcome.note === '' ? null : <Row label="note" value={outcome.note} />}
            </>
          )
          : null}
        {probe === null
          ? null
          : 'unavailable' in probe
            ? <Row label="probe" value={probe.unavailable} />
            : <Row label="plugin build" value={probe.packageVersion} />}
      </div>
    </div>
  )
}
