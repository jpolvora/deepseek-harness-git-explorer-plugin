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
import type { GitPingOutcome, GitStatusOutcome } from '../types.js';
/** The session list face the framework hands a session-scoped body. */
type SessionsHook = <T>(select: (state: SessionListState) => T) => T;
/** The slice of the client session store this panel reads. */
interface SessionListState {
    byId: Record<string, {
        cwd?: string;
    } | undefined>;
}
/** Props the framework and this plugin's business face deliver to the body. */
export interface GitBodyProps {
    /** The Session the tab belongs to, delivered by the sidebar's render call. */
    sessionId?: string;
    /** The client session store, part of the session standard kit. */
    useSessions?: SessionsHook;
    /** The status read, contributed through the slot's `inject` face factory. */
    gitStatus?: (requestRoot: string, signal: AbortSignal) => Promise<GitStatusOutcome>;
    /** The diagnostic probe, contributed through the same factory. */
    gitPing?: (requestRoot: string, signal: AbortSignal) => Promise<GitPingOutcome>;
}
/**
 * Render the panel.
 *
 * @param props - the session, the session store and the host bridge.
 * @returns the panel body.
 */
export declare function GitBody(props: GitBodyProps): React.ReactElement;
export {};
