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
import type { Context } from '@deepseek-ai/cordis'
import type { GitRootSource } from '../types.js'

/** The host services the chain reads, declared structurally. */
export interface HostFaces {
  sessions?: SessionLookup
  get?(name: string): unknown
}

/** The live Session store, narrowed to the header read this plugin makes. */
export interface SessionLookup {
  get(id: string): { header?: { cwd?: string } } | undefined
}

/** The persistence service, narrowed to the header-only read. */
interface PersistenceLookup {
  stat(id: string): Promise<{ header?: { cwd?: string } } | undefined>
}

/** The sandbox policy service, narrowed to the deployment fallback. */
interface PolicyLookup {
  workspaceRoot?: string
}

/** What the chain resolved. */
export interface ResolvedRoot {
  /** The directory git should run in, or null when nothing resolved. */
  root: string | null
  source: GitRootSource
  /** Whether the live Session store knew this Session. */
  sessionFound: boolean
  /** One line naming what failed, for the panel's note. */
  note: string
}

/**
 * Resolve the directory git runs in for one Session.
 *
 * @param ctx - the host context carrying the Session store and friends.
 * @param sessionId - the Session identity received on the wire.
 * @param requestRoot - the working directory the panel offered, if any.
 * @returns the resolved root and which link supplied it.
 */
export async function resolveRoot(
  ctx: Context,
  sessionId: string,
  requestRoot: string,
): Promise<ResolvedRoot> {
  const host = ctx as unknown as HostFaces
  const sessions = host.sessions ?? (host.get?.('sessions') as SessionLookup | undefined)
  const live = sessions?.get(sessionId)
  const sessionFound = live !== undefined

  const headerRoot = live?.header?.cwd
  if (headerRoot !== undefined && headerRoot !== '') {
    return { root: headerRoot, source: 'header', sessionFound, note: '' }
  }

  const persistence = host.get?.('sessionPersistence') as PersistenceLookup | undefined
  if (persistence !== undefined) {
    try {
      const stored = await persistence.stat(sessionId)
      const storedRoot = stored?.header?.cwd
      if (storedRoot !== undefined && storedRoot !== '') {
        return { root: storedRoot, source: 'persistence', sessionFound, note: '' }
      }
    } catch {
      // A persistence miss is not a failure: the chain moves on.
    }
  }

  if (requestRoot !== '') return { root: requestRoot, source: 'request', sessionFound, note: '' }

  const policy = host.get?.('sandboxPolicy') as PolicyLookup | undefined
  if (typeof policy?.workspaceRoot === 'string' && policy.workspaceRoot !== '') {
    return { root: policy.workspaceRoot, source: 'sandboxPolicy', sessionFound, note: '' }
  }

  return {
    root: null,
    source: 'none',
    sessionFound,
    note: sessionFound
      ? 'this Session has no working directory'
      : 'the host could not resolve this Session or its working directory',
  }
}
