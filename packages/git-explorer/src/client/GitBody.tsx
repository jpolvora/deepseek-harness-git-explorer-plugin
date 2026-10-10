/**
 * The Git panel body — the Source Control view.
 *
 * Groups render as directory trees (VS Code's shape): collapsible folders with compacted
 * chains, file-type glyphs, right-aligned status letters. On top of the read-only view it
 * offers the actions the screenshot asks for: hover stage/unstage/discard on a row,
 * stage-all/unstage-all on a group, and a message box with Commit (Ctrl+Enter).
 *
 * Destructive work is gated twice: the panel asks inline before calling, and the host
 * refuses a discard that arrives without `confirmed`.
 *
 * Styling: inline styles over the documented `--dsw-alias-*` tokens, matching M1.
 */
import * as React from 'react'
import {
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconPlusOutlineRegular,
  IconTrashOutlineRegular,
  classifyFileType,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { buildChangeTree, type ChangeTreeNode } from './change-tree.js'
import { GIT_DIFF_TAB_KIND } from '../types.js'
import styles from './GitBody.module.css'
import { en, fill, translator, type Translate } from './locales.js'
import type {
  GitChange,
  GitChangeStats,
  GitFileStatus,
  GitMutationResult,
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

/** The tab-information hook the sidebar injects into every tab body. */
type TabInfoHook = () => {
  tab: {
    id: string
    navigation: { params?: Record<string, unknown> }
    actions: { openTab(kind: string, options?: { params?: Record<string, unknown> }): void }
  }
}

/** Props the framework and this plugin's business face deliver to the body. */
export interface GitBodyProps {
  /** The Session the tab belongs to, delivered by the sidebar's render call. */
  sessionId?: string
  /** The framework's translator for this plugin's namespace, when the slot named one. */
  translate?: Translate
  /** Framework hook: how to open another tab from this one. */
  useTabInfo?: TabInfoHook
  /**
   * Fallback opener for a body that was not handed the tab hook: the column's own
   * navigation controller, contributed through the inject face.
   */
  openTab?: (kind: string, options?: { params?: Record<string, unknown> }) => void
  /** The client session store, part of the session standard kit. */
  useSessions?: SessionsHook
  /** The status read, contributed through the slot's `inject` face factory. */
  gitStatus?: (requestRoot: string, signal: AbortSignal) => Promise<GitStatusOutcome>
  /** The per-file line counts; an empty list simply means the rows show no numbers. */
  gitStats?: (requestRoot: string, signal: AbortSignal) => Promise<GitChangeStats[]>
  /** The diagnostic probe, contributed through the same factory. */
  gitPing?: (requestRoot: string, signal: AbortSignal) => Promise<GitPingOutcome>
  /** Stage paths. */
  gitStage?: (requestRoot: string, paths: string[], signal: AbortSignal) => Promise<GitMutationResult>
  /** Unstage paths, leaving the work tree untouched. */
  gitUnstage?: (requestRoot: string, paths: string[], signal: AbortSignal) => Promise<GitMutationResult>
  /** Discard work-tree changes; `confirmed` must be true. */
  gitDiscard?: (
    requestRoot: string,
    trackedPaths: string[],
    untrackedPaths: string[],
    confirmed: boolean,
    signal: AbortSignal,
  ) => Promise<GitMutationResult>
  /** Commit the index. */
  gitCommit?: (
    requestRoot: string,
    message: string,
    amend: boolean,
    signal: AbortSignal,
  ) => Promise<GitMutationResult>
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

/**
 * One class name from the stylesheet.
 *
 * The lookup is by key because `noUncheckedIndexedAccess` types every index result as
 * possibly absent; falling back to the key keeps a missing rule visible in the DOM rather
 * than rendering the string "undefined".
 *
 * @param name - the selector's name in the stylesheet.
 * @returns the hashed class name.
 */
function cls(name: string): string {
  return styles[name] ?? name
}
/** The class each status letter carries, matching VS Code's reading of the states. */
const TONE_CLASS: Record<GitFileStatus, string> = {
  modified: cls('toneModified'),
  added: cls('toneAdded'),
  deleted: cls('toneDeleted'),
  renamed: cls('toneRenamed'),
  copied: cls('toneCopied'),
  typechange: cls('toneTypechange'),
  conflicted: cls('toneConflicted'),
  untracked: cls('toneUntracked'),
}

/** Indent one nesting level. */
const INDENT_PX = 14

/** The localStorage key holding this tab's collapsed groups and directories. */
const COLLAPSE_KEY_PREFIX = 'dsh.git-explorer.collapsed.v1.'

/** One hover action on a row. */
interface RowAction {
  title: string
  icon: (props: { size?: number }) => React.ReactElement
  run: () => void
}

/** One label/value diagnostic line. */
function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className={styles.diagRow}>
      <span className={styles.diagLabel}>{label}</span>
      <span className={styles.breakAll}>{value}</span>
    </div>
  )
}

/**
 * The one value JavaScript still contributes to a row's look: its nesting depth, which
 * the stylesheet turns into padding through `--indent`.
 *
 * @param depth - how deep the row sits in the tree.
 * @returns the custom property the row class reads.
 */
function indentStyle(depth: number): React.CSSProperties {
  return { ['--indent']: depth } as React.CSSProperties
}

/** A borderless icon control, sized for a tree row. */
function IconAction({ title, icon: Icon, run }: RowAction): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation()
        run()
      }}
      className={styles.iconAction}
    >
      <Icon size={14} />
    </button>
  )
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
    <div role="treeitem" aria-expanded={!isCollapsed} onClick={() => { onToggle(node.path) }} className={styles.row} style={indentStyle(depth)}>
      <Chevron size={16} />
      <Folder size={16} />
      <span className={styles.ellipsis}>{node.name}</span>
    </div>
  )
}

/** A file row: glyph, name, right-aligned line counts, status letter, hover actions, and a
 * click that opens the comparison for this file. */
function FileRow({ node, depth, hovered, onHover, actions, onOpen, counts }: {
  node: ChangeTreeNode
  depth: number
  hovered: boolean
  onHover: (path: string | undefined) => void
  actions: RowAction[]
  onOpen: () => void
  /** Line counts for this path, when the host reported them. */
  counts?: GitChangeStats
}): React.ReactElement {
  const change = node.change
  if (change === undefined) {
    return <div className={styles.row} style={indentStyle(depth)}><span>{node.name}</span></div>
  }
  return (
    <div
      role="treeitem"
      title={change.origPath === undefined ? change.path : `${change.origPath} → ${change.path}`}
      onClick={onOpen}
      onMouseEnter={() => { onHover(change.path) }}
      onMouseLeave={() => { onHover(undefined) }}
      className={styles.row} style={indentStyle(depth)}
    >
      <span className={styles.glyphSlot} />
      <FileTypeIcon kind={classifyFileType(node.name)} size={16} />
      <span className={styles.growEllipsis}>
        {node.name}
      </span>
      {change.origPath === undefined
        ? null
        : <span className={styles.tertiary}>{change.origPath.split('/').pop()}</span>}
      {counts === undefined || counts.binary
        ? null
        : (
          <span className={styles.tertiaryPadded}>
            {`+${String(counts.added)} −${String(counts.removed)}`}
          </span>
        )}
      {hovered
        ? actions.map((action) => <IconAction key={action.title} {...action} />)
        : (
          <span className={`${cls('statusLetter')} ${TONE_CLASS[change.status]}`}>
            {STATUS_LETTER[change.status]}
          </span>
        )}
    </div>
  )
}

/** Rows for one level, recursing into directories that are expanded. */
function TreeRows({ nodes, depth, collapsed, onToggle, hovered, onHover, actionsFor, openFor, countsFor }: {
  nodes: readonly ChangeTreeNode[]
  depth: number
  collapsed: ReadonlySet<string>
  onToggle: (path: string) => void
  hovered: string | undefined
  onHover: (path: string | undefined) => void
  actionsFor: (change: GitChange) => RowAction[]
  openFor: (change: GitChange) => void
  countsFor: (change: GitChange) => GitChangeStats | undefined
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
                  actionsFor={actionsFor}
                  openFor={openFor}
                  countsFor={countsFor}
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
            actions={node.change === undefined ? [] : actionsFor(node.change)}
            onOpen={() => { if (node.change !== undefined) openFor(node.change) }}
            {...(node.change === undefined ? {} : { counts: countsFor(node.change) })}
          />
        ))}
    </>
  )
}

/** One collapsible group with its count badge, its bulk action and its tree. */
function Group({ title, changes, bulk, collapsedGroups, onToggleGroup, collapsedDirs, onToggleDir, hovered, onHover, actionsFor, openFor, countsFor }: {
  title: string
  changes: readonly GitChange[]
  bulk?: { label: string; run: () => void }
  collapsedGroups: ReadonlySet<string>
  onToggleGroup: (title: string) => void
  collapsedDirs: ReadonlySet<string>
  onToggleDir: (path: string) => void
  hovered: string | undefined
  onHover: (path: string | undefined) => void
  actionsFor: (change: GitChange) => RowAction[]
  openFor: (change: GitChange) => void
  countsFor: (change: GitChange) => GitChangeStats | undefined
}): React.ReactElement | null {
  const tree = React.useMemo(() => buildChangeTree(changes), [changes])
  if (changes.length === 0) return null
  const isCollapsed = collapsedGroups.has(title)
  const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular
  return (
    <div className={styles.groupBlock}>
      <div onClick={() => { onToggleGroup(title) }} className={`${styles.row} ${styles.groupHeader}`}>
        <Chevron size={16} />
        <span className={styles.strong}>{title}</span>
        <span className={styles.countBadge}>
          {changes.length}
        </span>
        {bulk === undefined
          ? null
          : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                bulk.run()
              }}
              className={styles.bulkAction}
            >
              {bulk.label}
            </button>
          )}
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
            actionsFor={actionsFor}
            openFor={openFor}
            countsFor={countsFor}
          />
        )}
    </div>
  )
}

/** The branch line: branch name, tracking drift and the repository root. */
function BranchLine({ status, t }: { status: GitStatusSummary; t: Translate }): React.ReactElement {
  const branch = status.branch ?? (status.detached ? t('panel.detached') : status.unborn ? t('panel.unborn') : t('panel.unknownBranch'))
  return (
    <div className={styles.branchColumn}>
      <div className={styles.branchRow}>
        <span className={styles.strong}>{branch}</span>
        {status.upstream === null
          ? null
          : <span className={styles.secondary}>{`↑${String(status.ahead)} ↓${String(status.behind)}`}</span>}
        {status.operation === null
          ? null
          : <span className={styles.warn}>{t('panel.operation', { operation: status.operation })}</span>}
      </div>
      {status.root === null ? null : <div className={styles.tertiaryBreak}>{status.root}</div>}
    </div>
  )
}

/** The message box and its Commit control. */
function CommitBox({ message, amend, busy, onMessage, onAmend, onCommit, t }: {
  t: Translate
  message: string
  amend: boolean
  busy: boolean
  onMessage: (value: string) => void
  onAmend: (value: boolean) => void
  onCommit: () => void
}): React.ReactElement {
  const ready = message.trim() !== '' && !busy
  return (
    <div className={styles.commitBox}>
      <textarea
        value={message}
        placeholder={t('commit.placeholder')}
        aria-label={t('commit.aria')}
        rows={2}
        onChange={(event) => { onMessage(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            if (ready) onCommit()
          }
        }}
        className={styles.commitInput}
      />
      <div className={styles.commitRow}>
        <button
          type="button"
          disabled={!ready}
          onClick={onCommit}
          className={ready ? styles.commitButton : styles.commitButtonDisabled}
        >
          {busy ? t('commit.busy') : amend ? t('commit.amendButton') : t('commit.button')}
        </button>
        <label className={styles.amendLabel}>
          <input type="checkbox" checked={amend} onChange={(event) => { onAmend(event.target.checked) }} />
          {t('commit.amend')}
        </label>
        <span className={styles.commitHint}>{t('commit.hint')}</span>
      </div>
    </div>
  )
}

/** The panel's own small button, token-styled. */
function Action({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={styles.outlineButton}
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
        <div className={styles.boundaryError}>
          {fill(en['panel.failed'], { message: this.state.failure })}
        </div>
      )
    }
    return this.props.children
  }
}

/** The localStorage key holding this tab's unsent commit message. */
const DRAFT_KEY_PREFIX = 'dsh.git-explorer.draft.v1.'

/** Read the unsent commit message and amend flag for this Session. */
function readDraft(sessionId: string | undefined): { message: string; amend: boolean } {
  if (sessionId === undefined) return { message: '', amend: false }
  try {
    const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${sessionId}`)
    if (raw === null) return { message: '', amend: false }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { message: '', amend: false }
    const value = parsed as { message?: unknown; amend?: unknown }
    return {
      message: typeof value.message === 'string' ? value.message : '',
      amend: value.amend === true,
    }
  } catch {
    return { message: '', amend: false }
  }
}

/** Remember the unsent commit message, so a closed tab does not lose a half-written one. */
function writeDraft(sessionId: string | undefined, draft: { message: string; amend: boolean }): void {
  if (sessionId === undefined) return
  try {
    if (draft.message === '' && !draft.amend) window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${sessionId}`)
    else window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${sessionId}`, JSON.stringify(draft))
  } catch {
    // Storage is best-effort; the box keeps working in memory.
  }
}

/** Read this tab's collapsed groups and directories. */
function readCollapsed(sessionId: string | undefined): { groups: string[]; directories: string[] } {  if (sessionId === undefined) return { groups: [], directories: [] }
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
function GitPanel({
  sessionId,
  translate,
  useSessions,
  useTabInfo,
  openTab,
  gitStatus,
  gitStats,
  gitPing,
  gitStage,
  gitUnstage,
  gitDiscard,
  gitCommit,
}: GitBodyProps): React.ReactElement {
  const t = translator(translate)
  const [outcome, setOutcome] = React.useState<GitStatusOutcome | null>(null)
  const [stats, setStats] = React.useState<GitChangeStats[]>([])
  const [probe, setProbe] = React.useState<GitPingOutcome | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [hovered, setHovered] = React.useState<string | undefined>(undefined)
  const draft = React.useRef<{ message: string; amend: boolean } | null>(null)
  if (draft.current === null) draft.current = readDraft(sessionId)
  const [message, setMessage] = React.useState(draft.current.message)
  const [amend, setAmend] = React.useState(draft.current.amend)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<GitMutationResult | null>(null)
  const [pendingDiscard, setPendingDiscard] = React.useState<{ tracked: string[]; untracked: string[] } | null>(null)
  const restored = React.useRef<{ groups: string[]; directories: string[] } | null>(null)
  if (restored.current === null) restored.current = readCollapsed(sessionId)
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<string>>(new Set(restored.current.groups))
  const [collapsedDirs, setCollapsedDirs] = React.useState<ReadonlySet<string>>(new Set(restored.current.directories))

  // The slot engine may hand a fresh business face on every render, so the callbacks are
  // read through a ref: depending on their identity in an effect would loop.
  const bridge = React.useRef<{
    gitStatus?: GitBodyProps['gitStatus']
    gitStats?: GitBodyProps['gitStats']
    gitPing?: GitBodyProps['gitPing']
    gitStage?: GitBodyProps['gitStage']
    gitUnstage?: GitBodyProps['gitUnstage']
    gitDiscard?: GitBodyProps['gitDiscard']
    gitCommit?: GitBodyProps['gitCommit']
  }>({})
  bridge.current = { gitStatus, gitStats, gitPing, gitStage, gitUnstage, gitDiscard, gitCommit }

  // The tab host is a *hook*, so it is called during render (never from a handler) and
  // its result is kept in a ref for the click handlers to use. Calling it from the
  // handler is React error #321: invalid hook call.
  const tab = useTabInfo?.()
  const tabRef = React.useRef<ReturnType<TabInfoHook> | undefined>(tab)
  tabRef.current = tab
  const openerRef = React.useRef<GitBodyProps['openTab']>(openTab)
  openerRef.current = openTab

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
    const readStats = bridge.current.gitStats
    if (readStats !== undefined) {
      void readStats(requestRoot, abort.signal).then(
        (result) => {
          if (live) setStats(result)
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

  /** Keep the unsent message across a tab switch or a reload. */
  React.useEffect(() => {
    writeDraft(sessionId, { message, amend })
  }, [sessionId, message, amend])

  /** The line counts reported for one row, matched by path and side. */
  const countsFor = (change: GitChange): GitChangeStats | undefined => {
    const staged = statusRef.current?.staged.some((entry) => entry.path === change.path) === true
    return stats.find((entry) => entry.path === change.path && entry.staged === staged)
  }

  /** Run one mutation, report what it said, and re-read the status. */
  const mutate = (run: (signal: AbortSignal) => Promise<GitMutationResult>): void => {
    setBusy(true)
    setNotice(null)
    void run(new AbortController().signal).then(
      (result) => {
        setBusy(false)
        setNotice(result)
        setAttempt((value) => value + 1)
      },
      (error: unknown) => {
        setBusy(false)
        setNotice({ ok: false, detail: error instanceof Error ? error.message : String(error) })
        setAttempt((value) => value + 1)
      },
    )
  }

  /** Ask before discarding, then discard with the confirmation the host requires. */
  const confirmDiscard = (): void => {
    const pending = pendingDiscard
    const discard = bridge.current.gitDiscard
    setPendingDiscard(null)
    if (pending === null || discard === undefined) return
    mutate((signal) => discard(requestRoot, pending.tracked, pending.untracked, true, signal))
  }

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

  const status = outcome !== null && !('unavailable' in outcome) && outcome.isRepo ? outcome : null
  const statusRef = React.useRef<GitStatusSummary | null>(status)
  statusRef.current = status
  const total = status === null
    ? 0
    : status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length

  /** The hover actions one row offers, depending on the group it sits in. */
  const actionsFor = (change: GitChange): RowAction[] => {
    const stage = bridge.current.gitStage
    const unstage = bridge.current.gitUnstage
    if (stage === undefined || unstage === undefined) return []
    const isStaged = status !== null && status.staged.includes(change)
    if (isStaged) {
      return [{
        title: t('action.unstage'),
        icon: IconCloseOutlineRegular,
        run: () => { mutate((signal) => unstage(requestRoot, [change.path], signal)) },
      }]
    }
    const untracked = status !== null && status.untracked.includes(change)
    return [
      {
        title: t('action.stage'),
        icon: IconPlusOutlineRegular,
        run: () => { mutate((signal) => stage(requestRoot, [change.path], signal)) },
      },
      {
        title: untracked ? t('action.discardUntracked') : t('action.discardTracked'),
        icon: IconTrashOutlineRegular,
        run: () => {
          setPendingDiscard(untracked ? { tracked: [], untracked: [change.path] } : { tracked: [change.path], untracked: [] })
        },
      },
    ]
  }

  const groupProps = {
    collapsedGroups,
    onToggleGroup: toggleGroup,
    collapsedDirs,
    onToggleDir: toggleDir,
    hovered,
    onHover: setHovered,
    actionsFor,
    countsFor,
  }

  /**
   * Open (or focus) the comparison tab for one file.
   *
   * The panel's own tab host is preferred, because it puts the diff in the pane the
   * panel lives in; when a body is not handed that hook the column's navigation service
   * opens it instead. A failure is reported rather than swallowed — "clicking does
   * nothing" is the least debuggable outcome there is.
   */
  const openComparison = (change: GitChange, staged: boolean, untracked: boolean): void => {
    const params = { path: change.path, staged, untracked, workspaceRoot: requestRoot }
    try {
      const actions = tabRef.current?.tab.actions
      if (actions !== undefined) {
        actions.openTab(GIT_DIFF_TAB_KIND, { params })
        return
      }
      const fallback = openerRef.current
      if (fallback !== undefined) {
        fallback(GIT_DIFF_TAB_KIND, { params })
        return
      }
      setNotice({ ok: false, detail: t('opener.missing') })
    } catch (error) {
      setNotice({ ok: false, detail: `opener.failed', { message: error instanceof Error ? error.message : String(error) })}` })
    }
  }

  const bulkFor = (paths: string[], label: string, run: (paths: string[]) => void): { label: string; run: () => void } => ({
    label,
    run: () => { run(paths) },
  })

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        {status === null ? <span className={styles.strong}>{t('type.label')}</span> : <BranchLine status={status} t={t} />}
        <Action label={t('panel.refresh')} onClick={() => { setAttempt((value) => value + 1) }} />
      </div>

      {status === null ? null : (
        <CommitBox
          t={t}
          message={message}
          amend={amend}
          busy={busy}
          onMessage={setMessage}
          onAmend={setAmend}
          onCommit={() => {
            const commit = bridge.current.gitCommit
            if (commit === undefined) return
            const text = message
            mutate(async (signal) => {
              const result = await commit(requestRoot, text, amend, signal)
              if (result.ok) {
                setMessage('')
                setAmend(false)
              }
              return result
            })
          }}
        />
      )}

      {notice === null ? null : (
        <div className={notice.ok ? styles.noticeOk : styles.noticeError}>
          {notice.detail}
        </div>
      )}

      {pendingDiscard === null ? null : (
        <div className={styles.confirmBar}>
          <span className={styles.warn}>
            {t('discard.confirm', { count: String(pendingDiscard.tracked.length + pendingDiscard.untracked.length) })}
          </span>
          <button
            type="button"
            onClick={confirmDiscard}
            className={styles.dangerButton}
          >
            {t('action.discard')}
          </button>
          <button
            type="button"
            onClick={() => { setPendingDiscard(null) }}
            className={styles.outlineButton}
          >
            {t('action.cancel')}
          </button>
        </div>
      )}

      <div role="tree" className={styles.treeTop}>
        {outcome === null
          ? <div className={styles.secondary}>{t('panel.reading')}</div>
          : 'unavailable' in outcome
            ? <div className={styles.errorText}>{outcome.unavailable}</div>
            : !outcome.isRepo
              ? (
                <div className={styles.secondary}>
                  {t('panel.notRepo')}
                  {outcome.note === '' ? null : <div className={styles.tertiary}>{outcome.note}</div>}
                </div>
              )
              : (
                <>
                  {outcome.conflicted.length === 0
                    ? null
                    : (
                      <div className={styles.warn}>
                        {`${String(outcome.conflicted.length)} ${t('panel.conflicted')}`}
                      </div>
                    )}
                  <Group
                    title={t('group.staged')}
                    changes={outcome.staged}
                    openFor={(change) => { openComparison(change, true, false) }}
                    bulk={bulkFor(outcome.staged.map((change) => change.path), t('action.unstageAll'), (paths) => {
                      const unstage = bridge.current.gitUnstage
                      if (unstage !== undefined) mutate((signal) => unstage(requestRoot, paths, signal))
                    })}
                    {...groupProps}
                  />
                  <Group
                    title={t('group.unstaged')}
                    changes={outcome.unstaged}
                    openFor={(change) => { openComparison(change, false, false) }}
                    bulk={bulkFor(outcome.unstaged.map((change) => change.path), t('action.stageAll'), (paths) => {
                      const stage = bridge.current.gitStage
                      if (stage !== undefined) mutate((signal) => stage(requestRoot, paths, signal))
                    })}
                    {...groupProps}
                  />
                  <Group
                    title={t('group.conflicted')}
                    changes={outcome.conflicted}
                    openFor={(change) => { openComparison(change, false, false) }}
                    {...groupProps}
                  />
                  <Group
                    title={t('group.untracked')}
                    changes={outcome.untracked}
                    openFor={(change) => { openComparison(change, false, true) }}
                    bulk={bulkFor(outcome.untracked.map((change) => change.path), t('action.stageAll'), (paths) => {
                      const stage = bridge.current.gitStage
                      if (stage !== undefined) mutate((signal) => stage(requestRoot, paths, signal))
                    })}
                    {...groupProps}
                  />
                  {total === 0 ? <div className={styles.secondary}>{t('panel.clean')}</div> : null}
                </>
              )}
      </div>

      <div
        className={styles.diagnostics}
      >
        <Row label={t('diagnostics.session')} value={sessionId ?? '(none)'} />
        <Row label={t('diagnostics.workspace')} value={requestRoot === '' ? t('diagnostics.unknown') : requestRoot} />
        {outcome !== null && !('unavailable' in outcome)
          ? (
            <>
              <Row label={t('diagnostics.rootSource')} value={outcome.rootSource} />
              <Row label={t('diagnostics.git')} value={outcome.gitVersion ?? t('diagnostics.notFound')} />
              <Row
                label={t('diagnostics.tabHost')}
                value={tabRef.current === undefined
                  ? openerRef.current === undefined ? t('diagnostics.hostNone') : t('diagnostics.hostOpener')
                  : t('diagnostics.hostPanel')}
              />
              {outcome.note === '' ? null : <Row label={t('diagnostics.note')} value={outcome.note} />}
            </>
          )
          : null}
        {probe === null
          ? null
          : 'unavailable' in probe
            ? <Row label={t('diagnostics.probe')} value={probe.unavailable} />
            : <Row label={t('diagnostics.build')} value={probe.packageVersion} />}
      </div>
    </div>
  )
}
