/**
 * Wire and identity types shared by the Git Explorer host half and client half.
 *
 * This module is the package's `./types` subpath. Remote boundary types must be
 * exported from a public non-root type subpath, which is why they live here rather
 * than in the package entry: the Typert generator rejects a boundary type reachable
 * only through the root export.
 *
 * Everything here is types and plain constants: both bundles inline it, so it must
 * stay free of services and of any package with runtime identity to share.
 */
/** The plugin's stable identity: the tab-type id, the slot key, and the package name. */
export declare const GIT_EXPLORER_ID = "@jpolv/dsh-git-explorer";
/** The right-sidebar tab kind this plugin registers. */
export declare const GIT_TAB_KIND = "git";
/** The Remote wire namespace the host service binds to (`remote.git.*`). */
export declare const GIT_REMOTE_NAMESPACE = "git";
/** How a file differs from `HEAD` (staged) or from the index (unstaged). */
export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'conflicted' | 'untracked';
/** One changed path, as the staged and unstaged groups both show it. */
export interface GitChange {
    /** Path as git spells it, relative to the repository root. */
    path: string;
    /** The previous path of a rename or copy. */
    origPath?: string;
    status: GitFileStatus;
    /** Index-status letter from the porcelain record; `.` means unmodified. */
    index: string;
    /** Worktree-status letter from the porcelain record; `?` marks an untracked path. */
    worktree: string;
    /** True when this entry belongs to the staged group. */
    staged: boolean;
    /** Rename/copy similarity percentage, when git reported one. */
    renameScore?: number;
}
/** Which link of the resolution chain supplied the repository's working directory. */
export type GitRootSource = 'header' | 'persistence' | 'request' | 'sandboxPolicy' | 'none';
/** The read-only working-tree state the panel renders. */
export interface GitStatusSummary {
    isRepo: boolean;
    /** The directory git runs in, or null when none could be resolved. */
    root: string | null;
    rootSource: GitRootSource;
    /** `git --version`, or null when git could not run. */
    gitVersion: string | null;
    /** An in-progress operation inferred from the git directory, if any. */
    operation: string | null;
    branch: string | null;
    detached: boolean;
    /** True before the first commit exists. */
    unborn: boolean;
    upstream: string | null;
    ahead: number;
    behind: number;
    staged: GitChange[];
    unstaged: GitChange[];
    untracked: GitChange[];
    conflicted: GitChange[];
    /** True when the entry cap cut the listing. */
    truncated: boolean;
    /** Records the parser could not classify, surfaced instead of swallowed. */
    skipped: string[];
    /** Human-readable context when something could not be resolved. */
    note: string;
}
/** What the bridge probe reports back to the panel. */
export interface GitPingResult {
    ok: true;
    /** The plugin's own version, so the panel can tell which build the host loaded. */
    packageVersion: string;
    /** `git --version` output, or null when git is missing or no working directory resolved. */
    gitVersion: string | null;
    /** The session's working directory the host resolved, by whatever source. */
    cwd: string | null;
    /** Always true here: a value can only arrive over the remote bridge. */
    remote: true;
    /** Whether the live Session store knew this Session id. */
    sessionFound?: boolean;
    /** Which link of the resolution chain supplied the working directory. */
    cwdSource?: GitRootSource;
    /** One line of extra context when something could not be resolved. */
    note?: string;
}
/** The panel's view of one bridge call: a host answer, or why none arrived. */
export type GitOutcome<T> = T | {
    unavailable: string;
};
/** The panel's view of the bridge probe. */
export type GitPingOutcome = GitOutcome<GitPingResult>;
/** The panel's view of a status read. */
export type GitStatusOutcome = GitOutcome<GitStatusSummary>;
