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
import type { GitMutationResult, GitPingOutcome, GitStatusOutcome } from '../types.js';
/** The session list face the framework hands a session-scoped body. */
type SessionsHook = <T>(select: (state: SessionListState) => T) => T;
/** The slice of the client session store this panel reads. */
interface SessionListState {
    byId: Record<string, {
        cwd?: string;
    } | undefined>;
}
/** The tab-information hook the sidebar injects into every tab body. */
type TabInfoHook = () => {
    tab: {
        id: string;
        navigation: {
            params?: Record<string, unknown>;
        };
        actions: {
            openTab(kind: string, options?: {
                params?: Record<string, unknown>;
            }): void;
        };
    };
};
/** Props the framework and this plugin's business face deliver to the body. */
export interface GitBodyProps {
    /** The Session the tab belongs to, delivered by the sidebar's render call. */
    sessionId?: string;
    /** Framework hook: how to open another tab from this one. */
    useTabInfo?: TabInfoHook;
    /** The client session store, part of the session standard kit. */
    useSessions?: SessionsHook;
    /** The status read, contributed through the slot's `inject` face factory. */
    gitStatus?: (requestRoot: string, signal: AbortSignal) => Promise<GitStatusOutcome>;
    /** The diagnostic probe, contributed through the same factory. */
    gitPing?: (requestRoot: string, signal: AbortSignal) => Promise<GitPingOutcome>;
    /** Stage paths. */
    gitStage?: (requestRoot: string, paths: string[], signal: AbortSignal) => Promise<GitMutationResult>;
    /** Unstage paths, leaving the work tree untouched. */
    gitUnstage?: (requestRoot: string, paths: string[], signal: AbortSignal) => Promise<GitMutationResult>;
    /** Discard work-tree changes; `confirmed` must be true. */
    gitDiscard?: (requestRoot: string, trackedPaths: string[], untrackedPaths: string[], confirmed: boolean, signal: AbortSignal) => Promise<GitMutationResult>;
    /** Commit the index. */
    gitCommit?: (requestRoot: string, message: string, amend: boolean, signal: AbortSignal) => Promise<GitMutationResult>;
}
/**
 * Render the panel.
 *
 * @param props - the session, the session store and the host bridge.
 * @returns the panel body.
 */
export declare function GitBody(props: GitBodyProps): React.ReactElement;
export {};
