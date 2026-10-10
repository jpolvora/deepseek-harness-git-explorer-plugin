import { runGit } from './commands.js';
/** The two comparisons a panel row can belong to. */
const NUMSTAT_ARGS = {
    unstaged: ['diff', '--numstat', '-z', '--no-renames'],
    staged: ['diff', '--cached', '--numstat', '-z', '--no-renames'],
};
/**
 * Parse one numstat stream.
 *
 * @param output - raw stdout of `git diff --numstat -z`.
 * @param staged - which comparison these counts belong to.
 * @returns one entry per changed path.
 */
export function parseNumstat(output, staged) {
    const entries = [];
    for (const token of output.split('\0')) {
        if (token === '')
            continue;
        const firstTab = token.indexOf('\t');
        const secondTab = firstTab === -1 ? -1 : token.indexOf('\t', firstTab + 1);
        if (firstTab === -1 || secondTab === -1)
            continue;
        const added = token.slice(0, firstTab);
        const removed = token.slice(firstTab + 1, secondTab);
        const path = token.slice(secondTab + 1);
        if (path === '')
            continue;
        const binary = added === '-' || removed === '-';
        entries.push({
            path,
            staged,
            added: binary ? 0 : Number(added),
            removed: binary ? 0 : Number(removed),
            binary,
        });
    }
    return entries;
}
/**
 * Read the line counts for both comparisons.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the repository root and cancellation.
 * @returns the counts for the work tree and the index, in that order.
 */
export async function readStats(ctx, limits, options) {
    const entries = [];
    for (const [key, args] of Object.entries(NUMSTAT_ARGS)) {
        const staged = key === 'staged';
        try {
            const result = await runGit(ctx, limits, { cwd: options.root, args: [...args], signal: options.signal });
            if (result.exitCode === 0)
                entries.push(...parseNumstat(result.stdout, staged));
        }
        catch {
            // Counts are decoration: a failed read leaves the rows without numbers rather
            // than failing the whole status refresh.
        }
    }
    return entries;
}
//# sourceMappingURL=numstat.js.map