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
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "git-explorer-client";
/** Services this half needs to exist before it applies. */
export declare const inject: string[];
/**
 * Mount the Remote contract, then register the tab type and its two render seats.
 *
 * @param ctx - the client context.
 */
export declare function apply(ctx: Context): Promise<void>;
