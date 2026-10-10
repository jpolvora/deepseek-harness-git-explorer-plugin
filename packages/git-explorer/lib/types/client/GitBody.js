import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import * as React from 'react';
import { FileTypeIcon, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, classifyFileType, } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildChangeTree } from './change-tree.js';
import { GIT_DIFF_TAB_KIND } from '../types.js';
import styles from './GitBody.module.css';
import { en, fill, translator } from './locales.js';
/** How one status letter reads in the row badge. */
const STATUS_LETTER = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    typechange: 'T',
    conflicted: 'U',
    untracked: 'U',
};
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
function cls(name) {
    return styles[name] ?? name;
}
/** The class each status letter carries, matching VS Code's reading of the states. */
const TONE_CLASS = {
    modified: cls('toneModified'),
    added: cls('toneAdded'),
    deleted: cls('toneDeleted'),
    renamed: cls('toneRenamed'),
    copied: cls('toneCopied'),
    typechange: cls('toneTypechange'),
    conflicted: cls('toneConflicted'),
    untracked: cls('toneUntracked'),
};
/** Indent one nesting level. */
const INDENT_PX = 14;
/** The localStorage key holding this tab's collapsed groups and directories. */
const COLLAPSE_KEY_PREFIX = 'dsh.git-explorer.collapsed.v1.';
/** One label/value diagnostic line. */
function Row({ label, value }) {
    return (_jsxs("div", { className: styles.diagRow, children: [_jsx("span", { className: styles.diagLabel, children: label }), _jsx("span", { className: styles.breakAll, children: value })] }));
}
/**
 * The one value JavaScript still contributes to a row's look: its nesting depth, which
 * the stylesheet turns into padding through `--indent`.
 *
 * @param depth - how deep the row sits in the tree.
 * @returns the custom property the row class reads.
 */
function indentStyle(depth) {
    return { ['--indent']: depth };
}
/** A borderless icon control, sized for a tree row. */
function IconAction({ title, icon: Icon, run }) {
    return (_jsx("button", { type: "button", title: title, "aria-label": title, onClick: (event) => {
            event.stopPropagation();
            run();
        }, className: styles.iconAction, children: _jsx(Icon, { size: 14 }) }));
}
/** A directory row: chevron, folder glyph, compacted label. */
function DirectoryRow({ node, depth, collapsed, onToggle }) {
    const isCollapsed = collapsed.has(node.path);
    const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular;
    const Folder = isCollapsed ? IconFolderCloseRegular : IconFolderOpenRegular;
    return (_jsxs("div", { role: "treeitem", "aria-expanded": !isCollapsed, onClick: () => { onToggle(node.path); }, className: styles.row, style: indentStyle(depth), children: [_jsx(Chevron, { size: 16 }), _jsx(Folder, { size: 16 }), _jsx("span", { className: styles.ellipsis, children: node.name })] }));
}
/** A file row: glyph, name, right-aligned line counts, status letter, hover actions, and a
 * click that opens the comparison for this file. */
function FileRow({ node, depth, hovered, onHover, actions, onOpen, counts }) {
    const change = node.change;
    if (change === undefined) {
        return _jsx("div", { className: styles.row, style: indentStyle(depth), children: _jsx("span", { children: node.name }) });
    }
    return (_jsxs("div", { role: "treeitem", title: change.origPath === undefined ? change.path : `${change.origPath} → ${change.path}`, onClick: onOpen, onMouseEnter: () => { onHover(change.path); }, onMouseLeave: () => { onHover(undefined); }, className: styles.row, style: indentStyle(depth), children: [_jsx("span", { className: styles.glyphSlot }), _jsx(FileTypeIcon, { kind: classifyFileType(node.name), size: 16 }), _jsx("span", { className: styles.growEllipsis, children: node.name }), change.origPath === undefined
                ? null
                : _jsx("span", { className: styles.tertiary, children: change.origPath.split('/').pop() }), counts === undefined || counts.binary
                ? null
                : (_jsx("span", { className: styles.tertiaryPadded, children: `+${String(counts.added)} −${String(counts.removed)}` })), hovered
                ? actions.map((action) => _jsx(IconAction, { ...action }, action.title))
                : (_jsx("span", { className: `${cls('statusLetter')} ${TONE_CLASS[change.status]}`, children: STATUS_LETTER[change.status] }))] }));
}
/** Rows for one level, recursing into directories that are expanded. */
function TreeRows({ nodes, depth, collapsed, onToggle, hovered, onHover, actionsFor, openFor, countsFor }) {
    return (_jsx(_Fragment, { children: nodes.map((node) => node.kind === 'directory'
            ? (_jsxs(React.Fragment, { children: [_jsx(DirectoryRow, { node: node, depth: depth, collapsed: collapsed, onToggle: onToggle }), collapsed.has(node.path)
                        ? null
                        : (_jsx(TreeRows, { nodes: node.children, depth: depth + 1, collapsed: collapsed, onToggle: onToggle, hovered: hovered, onHover: onHover, actionsFor: actionsFor, openFor: openFor, countsFor: countsFor }))] }, `d:${node.path}`))
            : (_jsx(FileRow, { node: node, depth: depth, hovered: hovered === node.path, onHover: onHover, actions: node.change === undefined ? [] : actionsFor(node.change), onOpen: () => { if (node.change !== undefined)
                    openFor(node.change); }, ...(node.change === undefined ? {} : { counts: countsFor(node.change) }) }, `f:${node.path}`))) }));
}
/** One collapsible group with its count badge, its bulk action and its tree. */
function Group({ title, changes, bulk, collapsedGroups, onToggleGroup, collapsedDirs, onToggleDir, hovered, onHover, actionsFor, openFor, countsFor }) {
    const tree = React.useMemo(() => buildChangeTree(changes), [changes]);
    if (changes.length === 0)
        return null;
    const isCollapsed = collapsedGroups.has(title);
    const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular;
    return (_jsxs("div", { className: styles.groupBlock, children: [_jsxs("div", { onClick: () => { onToggleGroup(title); }, className: `${styles.row} ${styles.groupHeader}`, children: [_jsx(Chevron, { size: 16 }), _jsx("span", { className: styles.strong, children: title }), _jsx("span", { className: styles.countBadge, children: changes.length }), bulk === undefined
                        ? null
                        : (_jsx("button", { type: "button", onClick: (event) => {
                                event.stopPropagation();
                                bulk.run();
                            }, className: styles.bulkAction, children: bulk.label }))] }), isCollapsed
                ? null
                : (_jsx(TreeRows, { nodes: tree, depth: 1, collapsed: collapsedDirs, onToggle: onToggleDir, hovered: hovered, onHover: onHover, actionsFor: actionsFor, openFor: openFor, countsFor: countsFor }))] }));
}
/** The branch line: branch name, tracking drift and the repository root. */
function BranchLine({ status, t }) {
    const branch = status.branch ?? (status.detached ? t('panel.detached') : status.unborn ? t('panel.unborn') : t('panel.unknownBranch'));
    return (_jsxs("div", { className: styles.branchColumn, children: [_jsxs("div", { className: styles.branchRow, children: [_jsx("span", { className: styles.strong, children: branch }), status.upstream === null
                        ? null
                        : _jsx("span", { className: styles.secondary, children: `↑${String(status.ahead)} ↓${String(status.behind)}` }), status.operation === null
                        ? null
                        : _jsx("span", { className: styles.warn, children: t('panel.operation', { operation: status.operation }) })] }), status.root === null ? null : _jsx("div", { className: styles.tertiaryBreak, children: status.root })] }));
}
/** The message box and its Commit control. */
function CommitBox({ message, amend, busy, onMessage, onAmend, onCommit, t }) {
    const ready = message.trim() !== '' && !busy;
    return (_jsxs("div", { className: styles.commitBox, children: [_jsx("textarea", { value: message, placeholder: t('commit.placeholder'), "aria-label": t('commit.aria'), rows: 2, onChange: (event) => { onMessage(event.target.value); }, onKeyDown: (event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        if (ready)
                            onCommit();
                    }
                }, className: styles.commitInput }), _jsxs("div", { className: styles.commitRow, children: [_jsx("button", { type: "button", disabled: !ready, onClick: onCommit, className: ready ? styles.commitButton : styles.commitButtonDisabled, children: busy ? t('commit.busy') : amend ? t('commit.amendButton') : t('commit.button') }), _jsxs("label", { className: styles.amendLabel, children: [_jsx("input", { type: "checkbox", checked: amend, onChange: (event) => { onAmend(event.target.checked); } }), t('commit.amend')] }), _jsx("span", { className: styles.commitHint, children: t('commit.hint') })] })] }));
}
/** The panel's own small button, token-styled. */
function Action({ label, onClick }) {
    return (_jsx("button", { type: "button", onClick: onClick, className: styles.outlineButton, children: label }));
}
/**
 * Catch a render failure and show it.
 *
 * A tab whose body throws renders as an empty pane, which reads as "the feature is
 * broken" with no clue why. This boundary turns that into a visible line.
 */
class PanelBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { failure: null };
    }
    static getDerivedStateFromError(error) {
        return { failure: error instanceof Error ? error.message : String(error) };
    }
    render() {
        if (this.state.failure !== null) {
            return (_jsx("div", { className: styles.boundaryError, children: fill(en['panel.failed'], { message: this.state.failure }) }));
        }
        return this.props.children;
    }
}
/** The localStorage key holding this tab's unsent commit message. */
const DRAFT_KEY_PREFIX = 'dsh.git-explorer.draft.v1.';
/** Read the unsent commit message and amend flag for this Session. */
function readDraft(sessionId) {
    if (sessionId === undefined)
        return { message: '', amend: false };
    try {
        const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${sessionId}`);
        if (raw === null)
            return { message: '', amend: false };
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null)
            return { message: '', amend: false };
        const value = parsed;
        return {
            message: typeof value.message === 'string' ? value.message : '',
            amend: value.amend === true,
        };
    }
    catch {
        return { message: '', amend: false };
    }
}
/** Remember the unsent commit message, so a closed tab does not lose a half-written one. */
function writeDraft(sessionId, draft) {
    if (sessionId === undefined)
        return;
    try {
        if (draft.message === '' && !draft.amend)
            window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${sessionId}`);
        else
            window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${sessionId}`, JSON.stringify(draft));
    }
    catch {
        // Storage is best-effort; the box keeps working in memory.
    }
}
/** Read this tab's collapsed groups and directories. */
function readCollapsed(sessionId) {
    if (sessionId === undefined)
        return { groups: [], directories: [] };
    try {
        const raw = window.localStorage.getItem(`${COLLAPSE_KEY_PREFIX}${sessionId}`);
        if (raw === null)
            return { groups: [], directories: [] };
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null)
            return { groups: [], directories: [] };
        const value = parsed;
        return {
            groups: Array.isArray(value.groups) ? value.groups.filter((item) => typeof item === 'string') : [],
            directories: Array.isArray(value.directories) ? value.directories.filter((item) => typeof item === 'string') : [],
        };
    }
    catch {
        // Unreadable collapse state is not worth failing a panel over.
        return { groups: [], directories: [] };
    }
}
/**
 * Render the panel.
 *
 * @param props - the session, the session store and the host bridge.
 * @returns the panel body.
 */
export function GitBody(props) {
    return (_jsx(PanelBoundary, { children: _jsx(GitPanel, { ...props }) }));
}
/**
 * Render the panel contents.
 *
 * @param props - the session, the session store and the host bridge.
 * @returns the panel body.
 */
function GitPanel({ sessionId, translate, useSessions, useTabInfo, openTab, gitStatus, gitStats, gitPing, gitStage, gitUnstage, gitDiscard, gitCommit, }) {
    const t = translator(translate);
    const [outcome, setOutcome] = React.useState(null);
    const [stats, setStats] = React.useState([]);
    const [probe, setProbe] = React.useState(null);
    const [attempt, setAttempt] = React.useState(0);
    const [hovered, setHovered] = React.useState(undefined);
    const draft = React.useRef(null);
    if (draft.current === null)
        draft.current = readDraft(sessionId);
    const [message, setMessage] = React.useState(draft.current.message);
    const [amend, setAmend] = React.useState(draft.current.amend);
    const [busy, setBusy] = React.useState(false);
    const [notice, setNotice] = React.useState(null);
    const [pendingDiscard, setPendingDiscard] = React.useState(null);
    const restored = React.useRef(null);
    if (restored.current === null)
        restored.current = readCollapsed(sessionId);
    const [collapsedGroups, setCollapsedGroups] = React.useState(new Set(restored.current.groups));
    const [collapsedDirs, setCollapsedDirs] = React.useState(new Set(restored.current.directories));
    // The slot engine may hand a fresh business face on every render, so the callbacks are
    // read through a ref: depending on their identity in an effect would loop.
    const bridge = React.useRef({});
    bridge.current = { gitStatus, gitStats, gitPing, gitStage, gitUnstage, gitDiscard, gitCommit };
    // The tab host is a *hook*, so it is called during render (never from a handler) and
    // its result is kept in a ref for the click handlers to use. Calling it from the
    // handler is React error #321: invalid hook call.
    const tab = useTabInfo?.();
    const tabRef = React.useRef(tab);
    tabRef.current = tab;
    const openerRef = React.useRef(openTab);
    openerRef.current = openTab;
    // The client's own view of the session's working directory: the host prefers its own
    // Session lookup and uses this only when that lookup cannot answer.
    const sessionCwd = useSessions === undefined || sessionId === undefined
        ? undefined
        : useSessions((state) => state?.byId?.[sessionId]?.cwd);
    const requestRoot = sessionCwd ?? '';
    React.useEffect(() => {
        const readStatus = bridge.current.gitStatus;
        const readProbe = bridge.current.gitPing;
        if (readStatus === undefined) {
            setOutcome({ unavailable: 'the host bridge is not mounted on this tab' });
            return;
        }
        const abort = new AbortController();
        let live = true;
        void readStatus(requestRoot, abort.signal).then((result) => {
            if (live)
                setOutcome(result);
        }, (error) => {
            if (live)
                setOutcome({ unavailable: error instanceof Error ? error.message : String(error) });
        });
        if (readProbe !== undefined) {
            void readProbe(requestRoot, abort.signal).then((result) => {
                if (live)
                    setProbe(result);
            }, () => undefined);
        }
        const readStats = bridge.current.gitStats;
        if (readStats !== undefined) {
            void readStats(requestRoot, abort.signal).then((result) => {
                if (live)
                    setStats(result);
            }, () => undefined);
        }
        return () => {
            live = false;
            abort.abort();
        };
    }, [requestRoot, attempt]);
    /** Remember the collapse state, so a reopened tab looks the way it was left. */
    React.useEffect(() => {
        if (sessionId === undefined)
            return;
        try {
            window.localStorage.setItem(`${COLLAPSE_KEY_PREFIX}${sessionId}`, JSON.stringify({
                groups: [...collapsedGroups],
                directories: [...collapsedDirs],
            }));
        }
        catch {
            // Storage is best-effort; the panel keeps working in memory.
        }
    }, [sessionId, collapsedGroups, collapsedDirs]);
    /** Keep the unsent message across a tab switch or a reload. */
    React.useEffect(() => {
        writeDraft(sessionId, { message, amend });
    }, [sessionId, message, amend]);
    /** The line counts reported for one row, matched by path and side. */
    const countsFor = (change) => {
        const staged = statusRef.current?.staged.some((entry) => entry.path === change.path) === true;
        return stats.find((entry) => entry.path === change.path && entry.staged === staged);
    };
    /** Run one mutation, report what it said, and re-read the status. */
    const mutate = (run) => {
        setBusy(true);
        setNotice(null);
        void run(new AbortController().signal).then((result) => {
            setBusy(false);
            setNotice(result);
            setAttempt((value) => value + 1);
        }, (error) => {
            setBusy(false);
            setNotice({ ok: false, detail: error instanceof Error ? error.message : String(error) });
            setAttempt((value) => value + 1);
        });
    };
    /** Ask before discarding, then discard with the confirmation the host requires. */
    const confirmDiscard = () => {
        const pending = pendingDiscard;
        const discard = bridge.current.gitDiscard;
        setPendingDiscard(null);
        if (pending === null || discard === undefined)
            return;
        mutate((signal) => discard(requestRoot, pending.tracked, pending.untracked, true, signal));
    };
    /** Toggle one group's expansion. */
    const toggleGroup = (title) => {
        setCollapsedGroups((current) => {
            const next = new Set(current);
            if (next.has(title))
                next.delete(title);
            else
                next.add(title);
            return next;
        });
    };
    /** Toggle one directory's expansion. */
    const toggleDir = (path) => {
        setCollapsedDirs((current) => {
            const next = new Set(current);
            if (next.has(path))
                next.delete(path);
            else
                next.add(path);
            return next;
        });
    };
    const status = outcome !== null && !('unavailable' in outcome) && outcome.isRepo ? outcome : null;
    const statusRef = React.useRef(status);
    statusRef.current = status;
    const total = status === null
        ? 0
        : status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;
    /** The hover actions one row offers, depending on the group it sits in. */
    const actionsFor = (change) => {
        const stage = bridge.current.gitStage;
        const unstage = bridge.current.gitUnstage;
        if (stage === undefined || unstage === undefined)
            return [];
        const isStaged = status !== null && status.staged.includes(change);
        if (isStaged) {
            return [{
                    title: t('action.unstage'),
                    icon: IconCloseOutlineRegular,
                    run: () => { mutate((signal) => unstage(requestRoot, [change.path], signal)); },
                }];
        }
        const untracked = status !== null && status.untracked.includes(change);
        return [
            {
                title: t('action.stage'),
                icon: IconPlusOutlineRegular,
                run: () => { mutate((signal) => stage(requestRoot, [change.path], signal)); },
            },
            {
                title: untracked ? t('action.discardUntracked') : t('action.discardTracked'),
                icon: IconTrashOutlineRegular,
                run: () => {
                    setPendingDiscard(untracked ? { tracked: [], untracked: [change.path] } : { tracked: [change.path], untracked: [] });
                },
            },
        ];
    };
    const groupProps = {
        collapsedGroups,
        onToggleGroup: toggleGroup,
        collapsedDirs,
        onToggleDir: toggleDir,
        hovered,
        onHover: setHovered,
        actionsFor,
        countsFor,
    };
    /**
     * Open (or focus) the comparison tab for one file.
     *
     * The panel's own tab host is preferred, because it puts the diff in the pane the
     * panel lives in; when a body is not handed that hook the column's navigation service
     * opens it instead. A failure is reported rather than swallowed — "clicking does
     * nothing" is the least debuggable outcome there is.
     */
    const openComparison = (change, staged, untracked) => {
        const params = { path: change.path, staged, untracked, workspaceRoot: requestRoot };
        try {
            const actions = tabRef.current?.tab.actions;
            if (actions !== undefined) {
                actions.openTab(GIT_DIFF_TAB_KIND, { params });
                return;
            }
            const fallback = openerRef.current;
            if (fallback !== undefined) {
                fallback(GIT_DIFF_TAB_KIND, { params });
                return;
            }
            setNotice({ ok: false, detail: t('opener.missing') });
        }
        catch (error) {
            setNotice({ ok: false, detail: `opener.failed', { message: error instanceof Error ? error.message : String(error) })}` });
        }
    };
    const bulkFor = (paths, label, run) => ({
        label,
        run: () => { run(paths); },
    });
    return (_jsxs("div", { className: styles.panel, children: [_jsxs("div", { className: styles.panelHeader, children: [status === null ? _jsx("span", { className: styles.strong, children: t('type.label') }) : _jsx(BranchLine, { status: status, t: t }), _jsx(Action, { label: t('panel.refresh'), onClick: () => { setAttempt((value) => value + 1); } })] }), status === null ? null : (_jsx(CommitBox, { t: t, message: message, amend: amend, busy: busy, onMessage: setMessage, onAmend: setAmend, onCommit: () => {
                    const commit = bridge.current.gitCommit;
                    if (commit === undefined)
                        return;
                    const text = message;
                    mutate(async (signal) => {
                        const result = await commit(requestRoot, text, amend, signal);
                        if (result.ok) {
                            setMessage('');
                            setAmend(false);
                        }
                        return result;
                    });
                } })), notice === null ? null : (_jsx("div", { className: notice.ok ? styles.noticeOk : styles.noticeError, children: notice.detail })), pendingDiscard === null ? null : (_jsxs("div", { className: styles.confirmBar, children: [_jsx("span", { className: styles.warn, children: t('discard.confirm', { count: String(pendingDiscard.tracked.length + pendingDiscard.untracked.length) }) }), _jsx("button", { type: "button", onClick: confirmDiscard, className: styles.dangerButton, children: t('action.discard') }), _jsx("button", { type: "button", onClick: () => { setPendingDiscard(null); }, className: styles.outlineButton, children: t('action.cancel') })] })), _jsx("div", { role: "tree", className: styles.treeTop, children: outcome === null
                    ? _jsx("div", { className: styles.secondary, children: t('panel.reading') })
                    : 'unavailable' in outcome
                        ? _jsx("div", { className: styles.errorText, children: outcome.unavailable })
                        : !outcome.isRepo
                            ? (_jsxs("div", { className: styles.secondary, children: [t('panel.notRepo'), outcome.note === '' ? null : _jsx("div", { className: styles.tertiary, children: outcome.note })] }))
                            : (_jsxs(_Fragment, { children: [outcome.conflicted.length === 0
                                        ? null
                                        : (_jsx("div", { className: styles.warn, children: `${String(outcome.conflicted.length)} ${t('panel.conflicted')}` })), _jsx(Group, { title: t('group.staged'), changes: outcome.staged, openFor: (change) => { openComparison(change, true, false); }, bulk: bulkFor(outcome.staged.map((change) => change.path), t('action.unstageAll'), (paths) => {
                                            const unstage = bridge.current.gitUnstage;
                                            if (unstage !== undefined)
                                                mutate((signal) => unstage(requestRoot, paths, signal));
                                        }), ...groupProps }), _jsx(Group, { title: t('group.unstaged'), changes: outcome.unstaged, openFor: (change) => { openComparison(change, false, false); }, bulk: bulkFor(outcome.unstaged.map((change) => change.path), t('action.stageAll'), (paths) => {
                                            const stage = bridge.current.gitStage;
                                            if (stage !== undefined)
                                                mutate((signal) => stage(requestRoot, paths, signal));
                                        }), ...groupProps }), _jsx(Group, { title: t('group.conflicted'), changes: outcome.conflicted, openFor: (change) => { openComparison(change, false, false); }, ...groupProps }), _jsx(Group, { title: t('group.untracked'), changes: outcome.untracked, openFor: (change) => { openComparison(change, false, true); }, bulk: bulkFor(outcome.untracked.map((change) => change.path), t('action.stageAll'), (paths) => {
                                            const stage = bridge.current.gitStage;
                                            if (stage !== undefined)
                                                mutate((signal) => stage(requestRoot, paths, signal));
                                        }), ...groupProps }), total === 0 ? _jsx("div", { className: styles.secondary, children: t('panel.clean') }) : null] })) }), _jsxs("div", { className: styles.diagnostics, children: [_jsx(Row, { label: t('diagnostics.session'), value: sessionId ?? '(none)' }), _jsx(Row, { label: t('diagnostics.workspace'), value: requestRoot === '' ? t('diagnostics.unknown') : requestRoot }), outcome !== null && !('unavailable' in outcome)
                        ? (_jsxs(_Fragment, { children: [_jsx(Row, { label: t('diagnostics.rootSource'), value: outcome.rootSource }), _jsx(Row, { label: t('diagnostics.git'), value: outcome.gitVersion ?? t('diagnostics.notFound') }), _jsx(Row, { label: t('diagnostics.tabHost'), value: tabRef.current === undefined
                                        ? openerRef.current === undefined ? t('diagnostics.hostNone') : t('diagnostics.hostOpener')
                                        : t('diagnostics.hostPanel') }), outcome.note === '' ? null : _jsx(Row, { label: t('diagnostics.note'), value: outcome.note })] }))
                        : null, probe === null
                        ? null
                        : 'unavailable' in probe
                            ? _jsx(Row, { label: t('diagnostics.probe'), value: probe.unavailable })
                            : _jsx(Row, { label: t('diagnostics.build'), value: probe.packageVersion })] })] }));
}
//# sourceMappingURL=GitBody.js.map