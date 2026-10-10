/**
 * The agent-facing tools.
 *
 * Three read-only tools over the same service the panel uses, so the model and the person
 * look at one source of truth: `git_status` reports the working tree, `git_diff` returns
 * the unified patch of one file, and `git_log` lists recent commits.
 *
 * Why the definitions are written out rather than produced by `defineTool`: that helper
 * lives in `@deepseek-ai/dsh-tools`, whose declarations reference Session types, and
 * importing it pulls `@deepseek-ai/dsh-session` into the program the Typert generator
 * analyzes — which fails generation with "merged interface TypertLookupMap contains a
 * declaration outside this face" (PLAN.md §11.3, rule 3). The registry accepts a plain
 * definition whose `parameters` is already a JSON Schema, so this module declares the
 * schemas directly and stays free of that dependency.
 *
 * These are deliberately read-only verbs. Staging and committing remain panel actions for
 * now, because a tool that mutates the work tree should carry the sandbox and approval
 * behaviour this plugin does not implement yet (PLAN.md §14.5).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GitCommitSummary, GitFileDiff, GitPatch, GitStatusSummary } from './types.js';
/** The service surface the tools read, narrowed to what they call. */
export interface GitToolFace {
    status(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<GitStatusSummary>;
    patch(sessionId: string, requestRoot: string, path: string, staged: boolean, signal: AbortSignal): Promise<GitPatch>;
    fileDiff(sessionId: string, requestRoot: string, path: string, staged: boolean, untracked: boolean, signal: AbortSignal): Promise<GitFileDiff>;
    log(sessionId: string, requestRoot: string, limit: number, path: string, signal: AbortSignal): Promise<GitCommitSummary[]>;
}
/**
 * Register the read-only git tools.
 *
 * @param ctx - the host context that carries the tools registry.
 * @param service - the git service the tools read.
 */
export declare function registerGitTools(ctx: Context, service: GitToolFace): void;
