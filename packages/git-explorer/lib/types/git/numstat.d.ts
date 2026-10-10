/**
 * Per-file line counts for the change rows.
 *
 * `git diff --numstat -z` is the cheapest way to get additions and deletions per path:
 * one call per comparison, NUL-separated so paths with spaces survive, `-` for the
 * counts of a binary file.
 *
 * The parser is a pure function over the raw output, so the shapes git actually emits —
 * including a rename, whose old and new paths arrive as separate NUL tokens — are
 * unit-testable without running git.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitCommandLimits } from './commands.js';
import type { GitChangeStats } from '../types.js';
/**
 * Parse one numstat stream.
 *
 * @param output - raw stdout of `git diff --numstat -z`.
 * @param staged - which comparison these counts belong to.
 * @returns one entry per changed path.
 */
export declare function parseNumstat(output: string, staged: boolean): GitChangeStats[];
/**
 * Read the line counts for both comparisons.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the repository root and cancellation.
 * @returns the counts for the work tree and the index, in that order.
 */
export declare function readStats(ctx: Context, limits: GitCommandLimits, options: {
    root: string;
    signal: AbortSignal;
}): Promise<GitChangeStats[]>;
