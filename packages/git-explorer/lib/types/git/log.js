import { runGit } from './commands.js';
/** The field separator inside one record. */
const FIELD = '\u001f';
/** The record separator between commits. */
const RECORD = '\u0000';
/** The format string: hash, short hash, author, ISO date, subject. */
const LOG_FORMAT = ['%H', '%h', '%an', '%aI', '%s'].join(FIELD);
/**
 * Parse one log stream.
 *
 * @param output - raw stdout of `git log --format=<LOG_FORMAT> -z`.
 * @returns one entry per commit, newest first.
 */
export function parseLog(output) {
    const commits = [];
    for (const record of output.split(RECORD)) {
        const trimmed = record.replace(/^\n/, '');
        if (trimmed === '')
            continue;
        const [hash, short, author, date, subject] = trimmed.split(FIELD);
        if (hash === undefined || short === undefined)
            continue;
        commits.push({
            hash,
            short,
            author: author ?? '',
            date: date ?? '',
            subject: subject ?? '',
        });
    }
    return commits;
}
/**
 * Read the most recent commits on the current branch.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the repository root, how many commits, and cancellation.
 * @returns the parsed commits, newest first; an empty list when the branch has none.
 */
export async function readLog(ctx, limits, options) {
    const args = ['log', `--format=${LOG_FORMAT}`, '-z', `--max-count=${String(options.limit)}`];
    if (options.path !== undefined && options.path !== '')
        args.push('--', options.path);
    const result = await runGit(ctx, limits, { cwd: options.root, args, signal: options.signal });
    // An unborn branch has no commits: git exits non-zero with "does not have any commits yet",
    // which is an empty log rather than a failure.
    if (result.exitCode !== 0)
        return [];
    return parseLog(result.stdout);
}
//# sourceMappingURL=log.js.map