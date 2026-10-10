import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import * as React from 'react';
import { DiffBlock, diffTotals } from '@deepseek-ai/dsh-client-ui-primitives';
/** Localized chrome for the diff primitive; the product's own words are reused. */
const LABELS = {
    codeLabel: 'text',
    wrapLabel: 'Wrap lines',
    unwrapLabel: 'Preserve columns',
    copy: 'Copy',
    copied: 'Copied',
    collapseAria: 'Collapse the unchanged lines',
    expandAria: (hidden) => `Expand ${String(hidden)} hidden lines`,
    collapse: 'Collapse',
    expand: (hidden) => `Expand ${String(hidden)} lines`,
};
/** A read-only line of chrome above the diff. */
function Header({ text, tone }) {
    return _jsx("div", { style: { color: tone ?? 'var(--dsw-alias-label-secondary)', paddingBottom: '6px' }, children: text });
}
/**
 * Render the comparison.
 *
 * @param props - the session, the tab hook and the host bridge.
 * @returns the diff body.
 */
export function GitDiffBody({ useTabInfo, gitDiff }) {
    const params = useTabInfo?.().tab.navigation.params;
    const path = typeof params?.path === 'string' ? params.path : '';
    const staged = params?.staged === true;
    const untracked = params?.untracked === true;
    const [outcome, setOutcome] = React.useState(null);
    const bridge = React.useRef(gitDiff);
    bridge.current = gitDiff;
    React.useEffect(() => {
        const read = bridge.current;
        if (read === undefined) {
            setOutcome({ unavailable: 'the host bridge is not mounted on this tab' });
            return;
        }
        if (path === '') {
            setOutcome({ unavailable: 'this diff tab has no file to compare' });
            return;
        }
        const abort = new AbortController();
        let live = true;
        void read(path, staged, untracked, abort.signal).then((result) => {
            if (live)
                setOutcome(result);
        }, (error) => {
            if (live)
                setOutcome({ unavailable: error instanceof Error ? error.message : String(error) });
        });
        return () => {
            live = false;
            abort.abort();
        };
    }, [path, staged, untracked]);
    if (outcome === null)
        return _jsx("div", { style: { padding: '10px 12px' }, children: _jsx(Header, { text: "Reading the diff\u2026" }) });
    if ('unavailable' in outcome) {
        return (_jsx("div", { style: { padding: '10px 12px', color: 'var(--dsw-alias-state-error-primary)' }, children: outcome.unavailable }));
    }
    const diff = outcome;
    const totals = diff.binary || diff.oversized ? null : diffTotals([{ path: diff.path, oldText: diff.oldText, newText: diff.newText }]);
    return (_jsxs("div", { style: { padding: '10px 12px', minWidth: 0 }, children: [_jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'baseline', paddingBottom: '6px' }, children: [_jsx("span", { style: { fontWeight: 600, wordBreak: 'break-all' }, children: diff.path }), _jsx("span", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: staged ? 'index vs HEAD' : 'working tree vs index' }), totals === null
                        ? null
                        : (_jsx("span", { style: { marginLeft: 'auto', color: 'var(--dsw-alias-label-secondary)' }, children: `+${String(totals.added)} −${String(totals.removed)}` }))] }), diff.binary
                ? _jsx(Header, { text: "A binary file has no text diff.", tone: "var(--dsw-alias-state-warn-label)" })
                : null, diff.oversized
                ? _jsx(Header, { text: "One side is larger than the read cap, so no diff is shown.", tone: "var(--dsw-alias-state-warn-label)" })
                : null, diff.note === '' ? null : _jsx(Header, { text: diff.note }), diff.binary || diff.oversized
                ? null
                : (_jsx(DiffBlock, { diffs: [{ path: diff.path, oldText: diff.oldText, newText: diff.newText }], labels: LABELS }))] }));
}
//# sourceMappingURL=GitDiffBody.js.map