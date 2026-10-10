/**
 * The Git Explorer client half.
 *
 * Registers the right-sidebar tab type, its guide card on the Start page, and the two
 * seats the sidebar renders: the body (`sidebar.right.pane.tab`) and the chip
 * (`sidebar.right.pane.tab.title`), both keyed by this package's definition id.
 *
 * `priority: 'extension'` is the band the sidebar documents for "a type from outside
 * the product" — the one a plugin like this belongs in.
 *
 * Two runtime rules this half exists to satisfy, both learned the hard way:
 *
 *  1. Nothing mounts a third-party package's generated Remote contract. The shipped
 *     `@deepseek-ai/dsh-api-remotes` half mounts only the contributions compiled into
 *     it, so this half mounts its own projection before it registers anything that
 *     calls the host.
 *  2. Cordis refuses a property access such as `remote.git` unless the service was
 *     declared through `inject` — and that binding appears only when the mount lands,
 *     which happens inside this very `apply`. The host calls are therefore bound in a
 *     scoped `ctx.inject(['remote.git'], …)` callback and passed to the body as props.
 */
import type { Context } from '@deepseek-ai/cordis'
// Our own generated Host-for-Client Remote projection. Importing it through the
// package's `./remote` export is a package self-reference: the bundler inlines it (and
// its zod schemas) exactly as the shipped remote assembly inlines the ones it mounts.
import { TYPERT_REMOTE } from '@jpolv/dsh-git-explorer/remote'
import {
  GIT_EXPLORER_ID,
  GIT_TAB_KIND,
  type GitPingOutcome,
  type GitPingResult,
  type GitStatusOutcome,
  type GitStatusSummary,
} from '../types.js'
import { GitBody } from './GitBody.js'
import { GitTitle } from './GitTitle.js'

export const name = 'git-explorer-client'

/** Services this half needs to exist before it applies. */
export const inject = ['slots', 'sidebarRightTabs', 'remote']

/** One guide entry: the "Git" card on the Start page. */
interface GuideEntrySpec {
  id: string
  order: number
  title: () => string
  description: () => string
}

/** The tab-type declaration this plugin contributes. */
interface TabTypeSpec {
  id: string
  kind: string
  priority: 'builtin' | 'extension' | 'fallback'
  keepMounted?: boolean
  title: () => string
  guide?: GuideEntrySpec[]
}

/** The face the sidebar exposes for tab types. */
interface TabTypeRegistry {
  register(spec: TabTypeSpec): () => void
}

/** The slot API this half uses, narrowed to what it registers. */
interface SlotRegistrar {
  inject(key: string, callback: () => () => void): () => void
  register(spec: Record<string, unknown>, component: unknown): () => void
}

/** The Client Remote registry, narrowed to the one call this half makes. */
interface RemoteRegistry {
  /** Mount one generated Host-for-Client contribution; resolves to its disposer. */
  $mount(contribution: unknown): Promise<() => Promise<void>>
}

/** The three client services this half reads, declared structurally (see the file doc). */
interface ClientFaces {
  slots: SlotRegistrar
  sidebarRightTabs: TabTypeRegistry
  remote: RemoteRegistry
}

/**
 * What every generated Remote method resolves to — the protocol's `RemoteResult`.
 *
 * Carrier failures arrive in the error branch rather than as a rejection, so a call has
 * to be unwrapped before any of its fields are read: reading a payload field off the
 * envelope silently yields `undefined`.
 */
type RemoteEnvelope<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code?: string; readonly message?: string } }

/** The generated `remote.git` namespace, narrowed to the methods the panel calls. */
interface GitNamespace {
  status(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<RemoteEnvelope<GitStatusSummary>>
  ping(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<RemoteEnvelope<GitPingResult>>
}

const GUIDE_DESCRIPTION = 'Stage, commit and review working-tree changes.'

/** How long a call waits for the mounted namespace to become injectable. */
const BRIDGE_READY_TIMEOUT_MS = 3_000

/** The host calls the panel receives, with the session already bound. */
interface HostCalls {
  status(requestRoot: string, signal: AbortSignal): Promise<GitStatusOutcome>
  ping(requestRoot: string, signal: AbortSignal): Promise<GitPingOutcome>
}

/**
 * Bind the host calls once Cordis admits the mounted namespace.
 *
 * @param ctx - the client context.
 * @returns a factory the slot engine calls per (session, actions).
 */
function hostCalls(ctx: Context): (sessionId: string) => HostCalls {
  let git: GitNamespace | undefined
  ctx.inject(['remote.git'], (scope) => {
    git = (scope as unknown as { remote: { git: GitNamespace } }).remote.git
    return () => {
      git = undefined
    }
  })

  /** Wait briefly for the mount, unwrap one call, and fold failures into the outcome. */
  const call = async <T>(
    run: (namespace: GitNamespace) => Promise<RemoteEnvelope<T>>,
  ): Promise<T | { unavailable: string }> => {
    const deadline = Date.now() + BRIDGE_READY_TIMEOUT_MS
    while (git === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (git === undefined) return { unavailable: 'remote.git did not mount in this page' }
    try {
      const result = await run(git)
      if (result.ok) return result.value
      return { unavailable: result.error?.message ?? result.error?.code ?? 'the host refused the call' }
    } catch (error) {
      return { unavailable: error instanceof Error ? error.message : String(error) }
    }
  }

  return (sessionId) => ({
    status: (requestRoot, signal) => call((namespace) => namespace.status(sessionId, requestRoot, signal)),
    ping: (requestRoot, signal) => call((namespace) => namespace.ping(sessionId, requestRoot, signal)),
  })
}

/**
 * Mount the Remote contract, then register the tab type and its two render seats.
 *
 * @param ctx - the client context.
 */
export async function apply(ctx: Context): Promise<void> {
  const faces = ctx as unknown as ClientFaces

  // The panel calls the host, so the contract goes up first and is awaited: the
  // namespaced service becomes injectable the moment this resolves.
  const unmount = await faces.remote.$mount(TYPERT_REMOTE)
  ctx.effect(() => () => unmount(), 'git-explorer: remote contract')

  const hostFor = hostCalls(ctx)

  ctx.effect(() => faces.sidebarRightTabs.register({
    id: GIT_EXPLORER_ID,
    kind: GIT_TAB_KIND,
    priority: 'extension',
    keepMounted: true,
    title: () => 'Git',
    guide: [{
      id: 'source-control',
      order: 5,
      title: () => 'Git',
      description: () => GUIDE_DESCRIPTION,
    }],
  }), 'git-explorer: tab type')

  ctx.effect(() => faces.slots.inject('sidebar.right.pane.tab', () => faces.slots.register({
    name: 'sidebar.right.pane.tab',
    key: GIT_EXPLORER_ID,
    // The slot's `inject` is a factory called per (session, actions); its return value
    // becomes the body's business props. Returning a plain object renders an empty pane.
    inject: (sessionId: string) => {
      const host = hostFor(sessionId)
      return {
        gitStatus: (requestRoot: string, signal: AbortSignal) => host.status(requestRoot, signal),
        gitPing: (requestRoot: string, signal: AbortSignal) => host.ping(requestRoot, signal),
      }
    },
  }, GitBody)), 'git-explorer: tab body')

  ctx.effect(() => faces.slots.inject('sidebar.right.pane.tab.title', () => faces.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: GIT_EXPLORER_ID,
  }, GitTitle)), 'git-explorer: tab title')
}
