import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import * as React from 'react';
import { FileTypeIcon, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular, classifyFileType, } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildChangeTree } from './change-tree.js';
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
/** The tone each status letter carries, matching VS Code's reading of the states. */
const STATUS_TONE = {
    modified: 'var(--dsw-alias-state-warn-label)',
    added: 'var(--dsw-alias-state-success-primary)',
    deleted: 'var(--dsw-alias-state-error-primary)',
    renamed: 'var(--dsw-alias-state-business-primary)',
    copied: 'var(--dsw-alias-state-business-primary)',
    typechange: 'var(--dsw-alias-state-warn-label)',
    conflicted: 'var(--dsw-alias-state-error-primary)',
    untracked: 'var(--dsw-alias-state-success-primary)',
};
/** The muted tokens the panel draws its secondary text with. */
const SECONDARY = 'var(--dsw-alias-label-secondary)';
const TERTIARY = 'var(--dsw-alias-label-tertiary)';
/** Indent one nesting level. */
const INDENT_PX = 14;
/** The localStorage key holding this tab's collapsed groups and directories. */
const COLLAPSE_KEY_PREFIX = 'dsh.git-explorer.collapsed.v1.';
/** One label/value diagnostic line. */
function Row({ label, value }) {
    return (_jsxs("div", { style: { display: 'flex', gap: '8px', padding: '1px 0' }, children: [_jsx("span", { style: { minWidth: '104px', color: TERTIARY }, children: label }), _jsx("span", { style: { wordBreak: 'break-all' }, children: value })] }));
}
/** The shared geometry of one tree row. */
function rowStyle(depth, hovered) {
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
    };
}
/** A directory row: chevron, folder glyph, compacted label. */
function DirectoryRow({ node, depth, collapsed, onToggle }) {
    const isCollapsed = collapsed.has(node.path);
    const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular;
    const Folder = isCollapsed ? IconFolderCloseRegular : IconFolderOpenRegular;
    return (_jsxs("div", { role: "treeitem", "aria-expanded": !isCollapsed, onClick: () => { onToggle(node.path); }, style: rowStyle(depth, false), children: [_jsx(Chevron, { size: 16 }), _jsx(Folder, { size: 16 }), _jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: node.name })] }));
}
/** A file row: glyph, name, right-aligned status letter. */
function FileRow({ node, depth, hovered, onHover }) {
    const change = node.change;
    if (change === undefined) {
        // Unreachable by construction; rendering the name beats rendering nothing.
        return _jsx("div", { style: rowStyle(depth, false), children: _jsx("span", { children: node.name }) });
    }
    return (_jsxs("div", { role: "treeitem", title: change.origPath === undefined ? change.path : `${change.origPath} → ${change.path}`, onMouseEnter: () => { onHover(change.path); }, onMouseLeave: () => { onHover(undefined); }, style: rowStyle(depth, hovered), children: [_jsx("span", { style: { width: 16, flexShrink: 0 } }), _jsx(FileTypeIcon, { kind: classifyFileType(node.name), size: 16 }), _jsx("span", { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: node.name }), change.origPath === undefined
                ? null
                : _jsx("span", { style: { color: TERTIARY, flexShrink: 0 }, children: change.origPath.split('/').pop() }), _jsx("span", { style: { color: STATUS_TONE[change.status], flexShrink: 0, paddingLeft: '6px' }, children: STATUS_LETTER[change.status] })] }));
}
/** Rows for one level, recursing into directories that are expanded. */
function TreeRows({ nodes, depth, collapsed, onToggle, hovered, onHover }) {
    return (_jsx(_Fragment, { children: nodes.map((node) => node.kind === 'directory'
            ? (_jsxs(React.Fragment, { children: [_jsx(DirectoryRow, { node: node, depth: depth, collapsed: collapsed, onToggle: onToggle }), collapsed.has(node.path)
                        ? null
                        : (_jsx(TreeRows, { nodes: node.children, depth: depth + 1, collapsed: collapsed, onToggle: onToggle, hovered: hovered, onHover: onHover }))] }, `d:${node.path}`))
            : (_jsx(FileRow, { node: node, depth: depth, hovered: hovered === node.path, onHover: onHover }, `f:${node.path}`))) }));
}
/** One collapsible group with its count badge and tree. */
function Group({ title, changes, collapsedGroups, onToggleGroup, collapsedDirs, onToggleDir, hovered, onHover }) {
    const tree = React.useMemo(() => buildChangeTree(changes), [changes]);
    if (changes.length === 0)
        return null;
    const isCollapsed = collapsedGroups.has(title);
    const Chevron = isCollapsed ? IconChevronRightOutlineRegular : IconChevronDownOutlineRegular;
    return (_jsxs("div", { style: { paddingTop: '6px' }, children: [_jsxs("div", { onClick: () => { onToggleGroup(title); }, style: { ...rowStyle(0, false), gap: '4px' }, children: [_jsx(Chevron, { size: 16 }), _jsx("span", { style: { fontWeight: 600 }, children: title }), _jsx("span", { style: {
                            marginLeft: 'auto',
                            background: 'var(--dsw-alias-bg-layer-3)',
                            borderRadius: '8px',
                            color: SECONDARY,
                            fontSize: '0.85em',
                            padding: '0 6px',
                        }, children: changes.length })] }), isCollapsed
                ? null
                : (_jsx(TreeRows, { nodes: tree, depth: 1, collapsed: collapsedDirs, onToggle: onToggleDir, hovered: hovered, onHover: onHover }))] }));
}
/** The branch line: branch name, tracking drift and the repository root. */
function BranchLine({ status }) {
    const branch = status.branch ?? (status.detached ? '(detached HEAD)' : status.unborn ? '(no commits yet)' : '(unknown)');
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }, children: [_jsx("span", { style: { fontWeight: 600 }, children: branch }), status.upstream === null
                        ? null
                        : _jsx("span", { style: { color: SECONDARY }, children: `↑${String(status.ahead)} ↓${String(status.behind)}` }), status.operation === null
                        ? null
                        : _jsx("span", { style: { color: 'var(--dsw-alias-state-warn-label)' }, children: `${status.operation} in progress` })] }), status.root === null ? null : _jsx("div", { style: { color: TERTIARY, wordBreak: 'break-all' }, children: status.root })] }));
}
/** The panel's own small button, token-styled. */
function Action({ label, onClick }) {
    return (_jsx("button", { type: "button", onClick: onClick, style: {
            background: 'transparent',
            border: '1px solid var(--dsw-alias-border-l3)',
            borderRadius: '4px',
            color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer',
            font: 'inherit',
            padding: '1px 8px',
            flexShrink: 0,
        }, children: label }));
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
            return (_jsx("div", { style: { padding: '10px 12px', color: 'var(--dsw-alias-state-error-primary)' }, children: `The Git panel failed to render: ${this.state.failure}` }));
        }
        return this.props.children;
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
function GitPanel({ sessionId, useSessions, gitStatus, gitPing }) {
    const [outcome, setOutcome] = React.useState(null);
    const [probe, setProbe] = React.useState(null);
    const [attempt, setAttempt] = React.useState(0);
    const [hovered, setHovered] = React.useState(undefined);
    const restored = React.useRef(null);
    if (restored.current === null)
        restored.current = readCollapsed(sessionId);
    const [collapsedGroups, setCollapsedGroups] = React.useState(new Set(restored.current.groups));
    const [collapsedDirs, setCollapsedDirs] = React.useState(new Set(restored.current.directories));
    // The slot engine may hand a fresh business face on every render, so the callbacks
    // are read through a ref: depending on their identity in the effect below would
    // re-run the read on every render, and each state write would render again.
    const bridge = React.useRef({});
    bridge.current = { gitStatus, gitPing };
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
    const total = outcome !== null && !('unavailable' in outcome)
        ? outcome.staged.length + outcome.unstaged.length + outcome.untracked.length + outcome.conflicted.length
        : 0;
    const groupProps = {
        collapsedGroups,
        onToggleGroup: toggleGroup,
        collapsedDirs,
        onToggleDir: toggleDir,
        hovered,
        onHover: setHovered,
    };
    return (_jsxs("div", { style: { padding: '10px 12px', lineHeight: 1.5 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }, children: [outcome !== null && !('unavailable' in outcome) && outcome.isRepo
                        ? _jsx(BranchLine, { status: outcome })
                        : _jsx("span", { style: { fontWeight: 600 }, children: "Git" }), _jsx(Action, { label: "Refresh", onClick: () => { setAttempt((value) => value + 1); } })] }), _jsx("div", { role: "tree", style: { paddingTop: '4px' }, children: outcome === null
                    ? _jsx("div", { style: { color: SECONDARY }, children: "Reading the working tree\u2026" })
                    : 'unavailable' in outcome
                        ? _jsx("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: outcome.unavailable })
                        : !outcome.isRepo
                            ? (_jsxs("div", { style: { color: SECONDARY }, children: ["Not a git repository.", outcome.note === '' ? null : _jsx("div", { style: { color: TERTIARY }, children: outcome.note })] }))
                            : (_jsxs(_Fragment, { children: [outcome.conflicted.length === 0
                                        ? null
                                        : (_jsx("div", { style: { color: 'var(--dsw-alias-state-warn-label)' }, children: `${String(outcome.conflicted.length)} conflicted file(s) need resolution` })), _jsx(Group, { title: "Staged changes", changes: outcome.staged, ...groupProps }), _jsx(Group, { title: "Changes", changes: outcome.unstaged, ...groupProps }), _jsx(Group, { title: "Conflicted", changes: outcome.conflicted, ...groupProps }), _jsx(Group, { title: "Untracked", changes: outcome.untracked, ...groupProps }), total === 0 ? _jsx("div", { style: { color: SECONDARY }, children: "No changes \u2014 the working tree is clean." }) : null] })) }), _jsxs("div", { style: {
                    paddingTop: '10px',
                    marginTop: '10px',
                    borderTop: '1px solid var(--dsw-alias-border-l3)',
                    color: TERTIARY,
                }, children: [_jsx(Row, { label: "session", value: sessionId ?? '(none)' }), _jsx(Row, { label: "workspace", value: requestRoot === '' ? '(unknown to the panel)' : requestRoot }), outcome !== null && !('unavailable' in outcome)
                        ? (_jsxs(_Fragment, { children: [_jsx(Row, { label: "root source", value: outcome.rootSource }), _jsx(Row, { label: "git", value: outcome.gitVersion ?? '(not found)' }), outcome.note === '' ? null : _jsx(Row, { label: "note", value: outcome.note })] }))
                        : null, probe === null
                        ? null
                        : 'unavailable' in probe
                            ? _jsx(Row, { label: "probe", value: probe.unavailable })
                            : _jsx(Row, { label: "plugin build", value: probe.packageVersion })] })] }));
}
//# sourceMappingURL=GitBody.js.map