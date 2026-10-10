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
import type { GitFileDiffOutcome } from '../types.js';
/** The tab-information hook the sidebar injects into every tab body. */
type TabInfoHook = () => {
    tab: {
        id: string;
        navigation: {
            params?: Record<string, unknown>;
        };
        actions: {
            openResource(address: string, options?: {
                params?: Record<string, unknown>;
            }): void;
        };
    };
};
/** Props the framework and this plugin's business face deliver to the diff body. */
export interface GitDiffBodyProps {
    /** The Session the tab belongs to. */
    sessionId?: string;
    /** Framework hook: the tab's own navigation parameters. */
    useTabInfo?: TabInfoHook;
    /** The comparison read, contributed through the slot's `inject` face factory. */
    gitDiff?: (path: string, staged: boolean, untracked: boolean, signal: AbortSignal) => Promise<GitFileDiffOutcome>;
}
/**
 * Render the comparison.
 *
 * @param props - the session, the tab hook and the host bridge.
 * @returns the diff body.
 */
export declare function GitDiffBody({ sessionId, useTabInfo, gitDiff }: GitDiffBodyProps): React.ReactElement;
export {};
