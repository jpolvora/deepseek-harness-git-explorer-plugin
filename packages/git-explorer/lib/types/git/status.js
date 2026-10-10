/** The staging groups, in panel order. */
const GROUPS = ['staged', 'unstaged', 'untracked', 'conflicted'];
/**
 * Map one porcelain status letter to the panel's status vocabulary.
 *
 * @param letter - `X` or `Y` from a `1`/`2` record, or a `u` record's pair.
 * @param untracked - whether the record is a `?` record.
 * @returns the status the row shows.
 */
function statusFor(letter, untracked = false) {
    if (untracked)
        return 'untracked';
    switch (letter) {
        case 'M': return 'modified';
        case 'A': return 'added';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'C': return 'copied';
        case 'T': return 'typechange';
        case 'U': return 'conflicted';
        default: return 'modified';
    }
}
/**
 * Parse one porcelain v2 stream.
 *
 * @param output - the raw stdout of `git status --porcelain=v2 -z --branch`.
 * @param limits - the entry cap.
 * @returns the parsed status, with entries grouped for the panel.
 */
export function parsePorcelainV2(output, limits) {
    const tokens = output.split('\0');
    const summary = {
        branch: null,
        detached: false,
        unborn: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        commits: { staged: [], unstaged: [], untracked: [], conflicted: [] },
        truncated: false,
        skipped: [],
    };
    let kept = 0;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === undefined || token === '')
            continue;
        if (token.startsWith('# ')) {
            const [key, ...rest] = token.slice(2).split(' ');
            const value = rest.join(' ');
            if (key === 'branch.oid')
                summary.unborn = value === '(initial)';
            else if (key === 'branch.head') {
                summary.detached = value === '(detached)';
                summary.branch = summary.detached ? null : value;
            }
            else if (key === 'branch.upstream')
                summary.upstream = value;
            else if (key === 'branch.ab') {
                const match = /^\+(-?\d+) -(-?\d+)$/.exec(value);
                if (match !== null) {
                    summary.ahead = Number(match[1]);
                    summary.behind = Number(match[2]);
                }
            }
            continue;
        }
        const kind = token[0];
        if (kind !== '1' && kind !== '2' && kind !== 'u' && kind !== '?' && kind !== '!') {
            summary.skipped.push(token.slice(0, 120));
            continue;
        }
        // The path is the last space-separated field of the record; with `-z` it is the
        // whole remainder after the fixed-width fields, but file names may contain spaces,
        // so only the leading fields are split off by position.
        const fields = token.split(' ');
        let path;
        let origPath;
        let indexLetter = '.';
        let worktreeLetter = '.';
        if (kind === '?') {
            path = token.slice(2);
        }
        else if (kind === '!') {
            path = token.slice(2);
        }
        else if (kind === 'u') {
            // u XY sub m1 m2 m3 mW h1 h2 h3 path
            indexLetter = fields[1]?.[0] ?? 'U';
            worktreeLetter = fields[1]?.[1] ?? 'U';
            path = fields.slice(10).join(' ');
        }
        else if (kind === '1') {
            indexLetter = fields[1]?.[0] ?? '.';
            worktreeLetter = fields[1]?.[1] ?? '.';
            path = fields.slice(8).join(' ');
        }
        else {
            indexLetter = fields[1]?.[0] ?? '.';
            worktreeLetter = fields[1]?.[1] ?? '.';
            path = fields.slice(9).join(' ');
            // A rename/copy record's original path is the next NUL-separated token.
            const next = tokens[index + 1];
            if (next !== undefined && next !== '') {
                origPath = next;
                index += 1;
            }
        }
        if (path === undefined || path === '') {
            summary.skipped.push(token.slice(0, 120));
            continue;
        }
        // The row's status follows the side that actually changed: the index letter when
        // the entry is staged, otherwise the worktree letter.
        const decisiveLetter = indexLetter !== '.' ? indexLetter : worktreeLetter;
        const change = {
            path,
            status: kind === '?' ? 'untracked'
                : kind === 'u' ? 'conflicted'
                    : statusFor(decisiveLetter),
            index: kind === '?' ? '?' : indexLetter,
            worktree: kind === '?' ? '?' : worktreeLetter,
            staged: kind === '1' || kind === '2' ? indexLetter !== '.' : false,
        };
        if (origPath !== undefined)
            change.origPath = origPath;
        if (kind === '2') {
            const score = fields[8]?.slice(1);
            if (score !== undefined && score !== '')
                change.renameScore = Number(score);
        }
        if (kept >= limits.maxFiles) {
            summary.truncated = true;
            continue;
        }
        kept += 1;
        if (kind === '?')
            summary.commits.untracked.push(change);
        else if (kind === 'u')
            summary.commits.conflicted.push(change);
        else if (kind === '!')
            continue;
        else {
            if (indexLetter !== '.')
                summary.commits.staged.push(change);
            if (worktreeLetter !== '.')
                summary.commits.unstaged.push(change);
        }
    }
    return summary;
}
/** Count entries across every group. */
export function changeCount(status) {
    return GROUPS.reduce((total, group) => total + status.commits[group].length, 0);
}
/**
 * Project the parsed status onto the wire summary the panel renders.
 *
 * @param parsed - the parser's output.
 * @param extra - repository identity and notes the service resolved.
 * @returns the wire payload.
 */
export function toStatusSummary(parsed, extra) {
    return {
        ...extra,
        branch: parsed.branch,
        detached: parsed.detached,
        unborn: parsed.unborn,
        upstream: parsed.upstream,
        ahead: parsed.ahead,
        behind: parsed.behind,
        staged: parsed.commits.staged,
        unstaged: parsed.commits.unstaged,
        untracked: parsed.commits.untracked,
        conflicted: parsed.commits.conflicted,
        truncated: parsed.truncated,
        skipped: parsed.skipped,
    };
}
//# sourceMappingURL=status.js.map