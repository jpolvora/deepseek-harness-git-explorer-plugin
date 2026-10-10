/**
 * The mutating git verbs.
 *
 * Every argv is built here as a pure function so the exact command shape is unit-testable,
 * and every path list is terminated with `--` so a file whose name looks like an option
 * can never be read as one. Nothing here interpolates a shell: the runner passes argv
 * straight to the executable.
 *
 * Destructive verbs (`discard`) require an explicit confirmation flag from the caller, and
 * a commit refuses an empty message. Anything the repository refuses comes back as a
 * failure detail rather than an exception, so the panel can show git's own words.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitCommandLimits } from './commands.js';
/** What one mutation did, in the panel's words. */
export interface GitMutationOutcome {
    ok: boolean;
    /** A short line: what happened, or the first line of git's refusal. */
    detail: string;
}
/** Stage the given paths. */
export declare function stageArgs(paths: readonly string[]): string[];
/** Unstage the given paths, leaving the work tree untouched. */
export declare function unstageArgs(paths: readonly string[]): string[];
/** Restore tracked paths from the index, discarding their work-tree edits. */
export declare function discardTrackedArgs(paths: readonly string[]): string[];
/** Remove untracked paths from the work tree. */
export declare function discardUntrackedArgs(paths: readonly string[]): string[];
/** Commit the index; the message travels on stdin so quoting cannot bite. */
export declare function commitArgs(options: {
    amend: boolean;
}): string[];
/**
 * Run one mutating command.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the argv, the directory, optional stdin, and cancellation.
 * @returns the outcome the panel reports.
 */
export declare function runMutation(ctx: Context, limits: GitCommandLimits, options: {
    cwd: string;
    args: readonly string[];
    stdin?: string;
    signal: AbortSignal;
}): Promise<GitMutationOutcome>;
