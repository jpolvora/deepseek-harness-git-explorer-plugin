import * as React from 'react';
// Our own generated Host-for-Client Remote projection. Importing it through the
// package's `./remote` export is a package self-reference: the bundler inlines it (and
// its zod schemas) exactly as the shipped remote assembly inlines the ones it mounts.
import { TYPERT_REMOTE } from '@jpolv/dsh-git-explorer/remote';
import { GIT_DIFF_ID, GIT_DIFF_TAB_KIND, GIT_EXPLORER_ID, GIT_TAB_KIND, } from '../types.js';
import { GitBody } from './GitBody.js';
import { GitDiffBody } from './GitDiffBody.js';
import { GitTitle } from './GitTitle.js';
export const name = 'git-explorer-client';
/** Services this half needs to exist before it applies. */
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'remote'];
const GUIDE_DESCRIPTION = 'Stage, commit and review working-tree changes.';
/** How long a call waits for the mounted namespace to become injectable. */
const BRIDGE_READY_TIMEOUT_MS = 3_000;
/**
 * Bind the host calls once Cordis admits the mounted namespace.
 *
 * @param ctx - the client context.
 * @returns a factory the slot engine calls per (session, actions).
 */
function hostCalls(ctx) {
    let git;
    ctx.inject(['remote.git'], (scope) => {
        git = scope.remote.git;
        return () => {
            git = undefined;
        };
    });
    /** Wait briefly for the mount, unwrap one call, and fold failures into the outcome. */
    const call = async (run) => {
        const deadline = Date.now() + BRIDGE_READY_TIMEOUT_MS;
        while (git === undefined && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (git === undefined)
            return { unavailable: 'remote.git did not mount in this page' };
        try {
            const result = await run(git);
            if (result.ok)
                return result.value;
            return { unavailable: result.error?.message ?? result.error?.code ?? 'the host refused the call' };
        }
        catch (error) {
            return { unavailable: error instanceof Error ? error.message : String(error) };
        }
    };
    return (sessionId) => ({
        status: (requestRoot, signal) => call((namespace) => namespace.status(sessionId, requestRoot, signal)),
        ping: (requestRoot, signal) => call((namespace) => namespace.ping(sessionId, requestRoot, signal)),
        fileDiff: (requestRoot, path, staged, untracked, signal) => call((namespace) => namespace.fileDiff(sessionId, requestRoot, path, staged, untracked, signal)),
        mutate: async (run, requestRoot, signal) => {
            const result = await call((namespace) => run(namespace, requestRoot, signal));
            // A mutation always answers with a payload (`ok` plus a line to show); only a
            // transport failure arrives as the panel's `unavailable` shape.
            if ('unavailable' in result)
                return { ok: false, detail: result.unavailable };
            return result;
        },
    });
}
/**
 * Mount the Remote contract, then register the tab type and its two render seats.
 *
 * @param ctx - the client context.
 */
export async function apply(ctx) {
    const faces = ctx;
    // The panel calls the host, so the contract goes up first and is awaited: the
    // namespaced service becomes injectable the moment this resolves.
    const unmount = await faces.remote.$mount(TYPERT_REMOTE);
    ctx.effect(() => () => unmount(), 'git-explorer: remote contract');
    const hostFor = hostCalls(ctx);
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
    }), 'git-explorer: tab type');
    ctx.effect(() => faces.slots.inject('sidebar.right.pane.tab', () => faces.slots.register({
        name: 'sidebar.right.pane.tab',
        key: GIT_EXPLORER_ID,
        // The slot's `inject` is a factory called per (session, actions); its return value
        // becomes the body's business props. Returning a plain object renders an empty pane.
        inject: (sessionId) => {
            const host = hostFor(sessionId);
            return {
                // Opening a tab prefers the panel's own tab host (it lands in the same pane);
                // this service call is the fallback for a body that was not handed that hook.
                openTab: (kind, options) => {
                    faces.sidebarRight.openTab(kind, options);
                },
                gitStatus: (requestRoot, signal) => host.status(requestRoot, signal),
                gitPing: (requestRoot, signal) => host.ping(requestRoot, signal),
                gitStage: (requestRoot, paths, signal) => host.mutate((namespace, root, inner) => namespace.stage(sessionId, root, paths, inner), requestRoot, signal),
                gitUnstage: (requestRoot, paths, signal) => host.mutate((namespace, root, inner) => namespace.unstage(sessionId, root, paths, inner), requestRoot, signal),
                gitDiscard: (requestRoot, trackedPaths, untrackedPaths, confirmed, signal) => host.mutate((namespace, root, inner) => namespace.discard(sessionId, root, trackedPaths, untrackedPaths, confirmed, inner), requestRoot, signal),
                gitCommit: (requestRoot, message, amend, signal) => host.mutate((namespace, root, inner) => namespace.commit(sessionId, root, message, amend, inner), requestRoot, signal),
            };
        },
    }, GitBody)), 'git-explorer: tab body');
    ctx.effect(() => faces.slots.inject('sidebar.right.pane.tab.title', () => faces.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: GIT_EXPLORER_ID,
    }, GitTitle)), 'git-explorer: tab title');
    // The comparison tab: one instance per file, opened by the panel with the path and
    // which comparison to show. `multiple: true` is what gives each file its own tab.
    ctx.effect(() => faces.sidebarRightTabs.register({
        id: GIT_DIFF_ID,
        kind: GIT_DIFF_TAB_KIND,
        priority: 'extension',
        multiple: true,
        title: () => 'Diff',
    }), 'git-explorer: diff tab type');
    ctx.effect(() => faces.slots.inject('sidebar.right.pane.tab', () => faces.slots.register({
        name: 'sidebar.right.pane.tab',
        key: GIT_DIFF_ID,
        inject: (sessionId) => {
            const host = hostFor(sessionId);
            return {
                gitDiff: (path, staged, untracked, signal) => host.fileDiff('', path, staged, untracked, signal),
            };
        },
    }, GitDiffBody)), 'git-explorer: diff body');
    ctx.effect(() => faces.slots.inject('sidebar.right.pane.tab.title', () => faces.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: GIT_DIFF_ID,
    }, DiffTitle)), 'git-explorer: diff title');
}
/**
 * The diff tab's chip: the file's own name, taken from the tab's navigation parameters.
 *
 * @returns the chip content.
 */
function DiffTitle({ useTabInfo }) {
    const params = useTabInfo?.().tab.navigation.params;
    const path = typeof params?.path === 'string' ? params.path : 'Diff';
    // This module is plain TypeScript, so the element is built without JSX.
    return React.createElement('span', null, path.split('/').pop() ?? path);
}
//# sourceMappingURL=index.js.map