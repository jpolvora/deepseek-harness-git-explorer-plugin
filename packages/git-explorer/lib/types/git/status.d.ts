/**
 * `git status --porcelain=v2 -z` parsing.
 *
 * The `-z` form is NUL-terminated and never quotes paths, which is what makes it the
 * only safe status format for this panel: spaces, `->` sequences and (rare) newlines
 * in file names all survive, and Windows paths arrive as git spells them.
 *
 * Record grammar (git-status(1)):
 *   `# <header>`                     branch headers when `--branch` is passed
 *   `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
 *   `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>` + a following NUL token
 *                                    holding the original path of a rename/copy
 *   `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
 *   `? <path>`                       untracked
 *   `! <path>`                       ignored
 *
 * This module is a pure function over the raw output: no services, no I/O.
 */
import type { GitChange, GitStatusSummary } from '../types.js';
/** One parsed line-window of the porcelain stream. */
export interface ParsedStatus {
    branch: string | null;
    detached: boolean;
    /** True when HEAD has no commit yet (`# branch.oid (initial)`). */
    unborn: boolean;
    upstream: string | null;
    ahead: number;
    behind: number;
    commits: {
        staged: GitChange[];
        unstaged: GitChange[];
        untracked: GitChange[];
        conflicted: GitChange[];
    };
    /** Entries dropped because the caller's cap was reached. */
    truncated: boolean;
    /** Anything the parser could not classify, reported rather than swallowed. */
    skipped: string[];
}
/** What the parser needs from configuration. */
export interface ParseLimits {
    /** Cap on entries kept across every group. */
    maxFiles: number;
}
/**
 * Parse one porcelain v2 stream.
 *
 * @param output - the raw stdout of `git status --porcelain=v2 -z --branch`.
 * @param limits - the entry cap.
 * @returns the parsed status, with entries grouped for the panel.
 */
export declare function parsePorcelainV2(output: string, limits: ParseLimits): ParsedStatus;
/** Count entries across every group. */
export declare function changeCount(status: Pick<ParsedStatus, 'commits'>): number;
/**
 * Project the parsed status onto the wire summary the panel renders.
 *
 * @param parsed - the parser's output.
 * @param extra - repository identity and notes the service resolved.
 * @returns the wire payload.
 */
export declare function toStatusSummary(parsed: ParsedStatus, extra: Pick<GitStatusSummary, 'isRepo' | 'root' | 'rootSource' | 'operation' | 'gitVersion' | 'note'>): GitStatusSummary;
