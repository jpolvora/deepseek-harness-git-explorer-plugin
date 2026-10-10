/**
 * The commit log read.
 *
 * `git log` with a NUL-separated, fixed-field format: subject lines may contain anything,
 * so the fields are separated by `\x1f` (unit separator) and the records by `\x00`, which
 * no commit message can produce accidentally.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitCommandLimits } from './commands.js';
import type { GitCommitSummary } from '../types.js';
/**
 * Parse one log stream.
 *
 * @param output - raw stdout of `git log --format=<LOG_FORMAT> -z`.
 * @returns one entry per commit, newest first.
 */
export declare function parseLog(output: string): GitCommitSummary[];
/**
 * Read the most recent commits on the current branch.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the repository root, how many commits, and cancellation.
 * @returns the parsed commits, newest first; an empty list when the branch has none.
 */
export declare function readLog(ctx: Context, limits: GitCommandLimits, options: {
    root: string;
    limit: number;
    path?: string;
    signal: AbortSignal;
}): Promise<GitCommitSummary[]>;
