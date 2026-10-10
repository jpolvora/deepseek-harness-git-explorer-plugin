/**
 * Reading the two sides of one changed file.
 *
 * The panel's diff view needs text, not a patch: the shipped `DiffBlock` computes the
 * diff itself from an old side and a new side. For a staged change those sides are
 * `HEAD:<path>` and the index; for an unstaged one they are the index and the work tree.
 * An untracked file has no old side at all, and a deleted file has no new side — both are
 * reported as empty text rather than as an error.
 *
 * Binary and oversized files are reported as flags. A caller that renders a truncated
 * diff as if it were complete is worse than one that says "binary".
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitCommandLimits } from './commands.js';
import type { GitFileDiff } from '../types.js';
/** How the two sides of the file are read. */
export interface DiffReadOptions {
    /** The repository root. */
    root: string;
    /** The repository-relative path. */
    path: string;
    /** True for the index↔HEAD comparison, false for work-tree↔index. */
    staged: boolean;
    /** True when git does not track the path yet, so there is no old side. */
    untracked: boolean;
    /** The complete-file cap; a larger side is reported as oversized. */
    maxFileBytes: number;
    signal: AbortSignal;
}
/**
 * Read both sides of one changed file.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - which file, which comparison, and the caps.
 * @returns the two sides plus the flags the panel renders.
 */
export declare function readFileDiff(ctx: Context, limits: GitCommandLimits, options: DiffReadOptions): Promise<GitFileDiff>;
