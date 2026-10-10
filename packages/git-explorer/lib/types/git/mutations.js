import { runGit } from './commands.js';
/** Stage the given paths. */
export function stageArgs(paths) {
    return ['add', '--', ...paths];
}
/** Unstage the given paths, leaving the work tree untouched. */
export function unstageArgs(paths) {
    return ['restore', '--staged', '--', ...paths];
}
/** Restore tracked paths from the index, discarding their work-tree edits. */
export function discardTrackedArgs(paths) {
    return ['restore', '--', ...paths];
}
/** Remove untracked paths from the work tree. */
export function discardUntrackedArgs(paths) {
    return ['clean', '-f', '--', ...paths];
}
/** Commit the index; the message travels on stdin so quoting cannot bite. */
export function commitArgs(options) {
    return options.amend ? ['commit', '--amend', '-F', '-'] : ['commit', '-F', '-'];
}
/** The first non-empty line of a git refusal. */
function firstLine(text, fallback) {
    const line = text.trim().split('\n').map((candidate) => candidate.trim()).find((candidate) => candidate !== '');
    return (line ?? fallback).slice(0, 300);
}
/**
 * Run one mutating command.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the argv, the directory, optional stdin, and cancellation.
 * @returns the outcome the panel reports.
 */
export async function runMutation(ctx, limits, options) {
    try {
        const result = await runGit(ctx, limits, {
            cwd: options.cwd,
            args: options.args,
            ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
            signal: options.signal,
        });
        if (result.exitCode === 0) {
            return { ok: true, detail: firstLine(result.stdout, 'done') };
        }
        return { ok: false, detail: firstLine(result.stderr, `git exited ${String(result.exitCode)}`) };
    }
    catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
}
//# sourceMappingURL=mutations.js.map