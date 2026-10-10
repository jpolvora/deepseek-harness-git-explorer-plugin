/**
 * Shared contract between the Git Explorer host half and client half.
 *
 * Only types and plain constants live here: the host bundler and the client
 * bundle both inline this module, so it must stay free of runtime services and
 * of any package with runtime identity to share.
 */
/** The plugin's stable identity: the tab-type id, the slot key, and the package name. */
export const GIT_EXPLORER_ID = '@jpolv/dsh-git-explorer';
/** The right-sidebar tab kind this plugin registers. */
export const GIT_TAB_KIND = 'git';
/** The Remote wire namespace the host service binds to (`remote.git.*`). */
export const GIT_REMOTE_NAMESPACE = 'git';
//# sourceMappingURL=contract.js.map