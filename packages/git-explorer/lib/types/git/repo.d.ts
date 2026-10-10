/**
 * Working-directory resolution for one Session.
 *
 * The chain exists because no single source is always available: the live Session
 * store covers an open Session, persistence covers a cold one, the panel's own request
 * covers a host whose Session lookup is unavailable, and the deployment's workspace
 * root is the last resort. The link that answered is reported to the panel, so an
 * unexpected source is visible instead of silent.
 *
 * Every service is read structurally: importing a DSH package's declarations would
 * pull unregistered packages into the Typert program and break generation.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GitRootSource } from '../types.js';
/** The host services the chain reads, declared structurally. */
export interface HostFaces {
    sessions?: SessionLookup;
    get?(name: string): unknown;
}
/** The live Session store, narrowed to the header read this plugin makes. */
export interface SessionLookup {
    get(id: string): {
        header?: {
            cwd?: string;
        };
    } | undefined;
}
/** What the chain resolved. */
export interface ResolvedRoot {
    /** The directory git should run in, or null when nothing resolved. */
    root: string | null;
    source: GitRootSource;
    /** Whether the live Session store knew this Session. */
    sessionFound: boolean;
    /** One line naming what failed, for the panel's note. */
    note: string;
}
/**
 * Resolve the directory git runs in for one Session.
 *
 * @param ctx - the host context carrying the Session store and friends.
 * @param sessionId - the Session identity received on the wire.
 * @param requestRoot - the working directory the panel offered, if any.
 * @returns the resolved root and which link supplied it.
 */
export declare function resolveRoot(ctx: Context, sessionId: string, requestRoot: string): Promise<ResolvedRoot>;
