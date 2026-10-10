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
export const GIT_EXPLORER_ID = '@jpolv/dsh-git-explorer';
/** The right-sidebar tab kind this plugin registers. */
export const GIT_TAB_KIND = 'git';
/** The Remote wire namespace the host service binds to (`remote.git.*`). */
export const GIT_REMOTE_NAMESPACE = 'git';
//# sourceMappingURL=types.js.map