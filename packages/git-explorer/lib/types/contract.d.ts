/**
 * Shared contract between the Git Explorer host half and client half.
 *
 * Only types and plain constants live here: the host bundler and the client
 * bundle both inline this module, so it must stay free of runtime services and
 * of any package with runtime identity to share.
 */
/** The plugin's stable identity: the tab-type id, the slot key, and the package name. */
export declare const GIT_EXPLORER_ID = "@jpolv/dsh-git-explorer";
/** The right-sidebar tab kind this plugin registers. */
export declare const GIT_TAB_KIND = "git";
/** The Remote wire namespace the host service binds to (`remote.git.*`). */
export declare const GIT_REMOTE_NAMESPACE = "git";
/** What the M0 bridge probe reports back to the panel. */
export interface GitPingResult {
    ok: true;
    /** The plugin's own version, so the panel can tell which build the host loaded. */
    packageVersion: string;
    /** `git --version` output, or null when git is missing or the session has no cwd. */
    gitVersion: string | null;
    /** The Session's working directory the host resolved. */
    cwd: string | null;
    /** Always true here: a value can only arrive over the remote bridge. */
    remote: true;
}
/** The panel's view of the bridge: either a host answer or why none arrived. */
export type GitPingOutcome = GitPingResult | {
    unavailable: string;
};
