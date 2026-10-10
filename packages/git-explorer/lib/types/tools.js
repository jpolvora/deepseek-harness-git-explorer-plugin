/**
 * Wrap one tool's arguments into the JSON Schema the registry validates against.
 *
 * @param properties - the accepted properties.
 * @param required - the ones a call must supply.
 * @returns an object-rooted schema.
 */
function schema(properties, required) {
    return {
        type: 'object',
        properties,
        required: [...required],
        additionalProperties: false,
    };
}
/** The Session id a tool call belongs to, or undefined when it has none. */
function sessionOf(exec) {
    const id = exec.agent?.session?.id;
    return id === undefined ? undefined : String(id);
}
/** A positive integer argument, or the fallback when it is absent or unusable. */
function count(value, fallback, cap) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.min(Math.floor(value), cap)
        : fallback;
}
/** One changed path, as a tool answer lists it. */
function listChanges(summary, maxFiles) {
    const trim = (entries) => entries.slice(0, maxFiles).map((entry) => (entry.origPath === undefined
        ? { path: entry.path, status: entry.status }
        : { path: entry.path, status: entry.status, from: entry.origPath }));
    return {
        staged: trim(summary.staged),
        unstaged: trim(summary.unstaged),
        untracked: trim(summary.untracked),
        conflicted: trim(summary.conflicted),
        truncated: summary.truncated,
    };
}
/** Every tool this plugin registers. */
function definitions(service) {
    return [
        {
            name: 'git_status',
            description: 'Report the working tree of the session workspace: branch, upstream drift, in-progress operation, and the staged, unstaged, untracked and conflicted paths. Read-only.',
            parameters: schema({
                maxFiles: { type: 'number', description: 'Cap on paths listed per group; defaults to 100.' },
            }, []),
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(args, exec) {
                const sessionId = sessionOf(exec);
                if (sessionId === undefined)
                    return JSON.stringify({ error: 'this call has no session' });
                const summary = await service.status(sessionId, '', exec.signal);
                return JSON.stringify({
                    isRepo: summary.isRepo,
                    root: summary.root,
                    rootSource: summary.rootSource,
                    branch: summary.branch,
                    detached: summary.detached,
                    unborn: summary.unborn,
                    upstream: summary.upstream,
                    ahead: summary.ahead,
                    behind: summary.behind,
                    operation: summary.operation,
                    changes: listChanges(summary, count(args.maxFiles, 100, 5_000)),
                    note: summary.note,
                });
            },
        },
        {
            name: 'git_diff',
            description: 'Return the unified patch of one changed file in the session workspace: the work tree against the index by default, or the index against HEAD with staged. Read-only.',
            parameters: schema({
                path: { type: 'string', description: 'Path relative to the repository root, as git_status reports it.' },
                staged: { type: 'boolean', description: 'True for the staged comparison (index against HEAD).' },
                untracked: { type: 'boolean', description: 'True when git does not track the path yet; the whole file is then reported as added.' },
            }, ['path']),
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(args, exec) {
                const sessionId = sessionOf(exec);
                if (sessionId === undefined)
                    return JSON.stringify({ error: 'this call has no session' });
                const path = typeof args.path === 'string' ? args.path : '';
                if (path === '')
                    return JSON.stringify({ error: 'path is required' });
                const staged = args.staged === true;
                if (args.untracked === true) {
                    const diff = await service.fileDiff(sessionId, '', path, staged, true, exec.signal);
                    return JSON.stringify({
                        path,
                        staged,
                        untracked: true,
                        binary: diff.binary,
                        oversized: diff.oversized,
                        added: diff.newText,
                        note: diff.note,
                    });
                }
                const patch = await service.patch(sessionId, '', path, staged, exec.signal);
                return JSON.stringify({ path, staged, patch: patch.patch, note: patch.note });
            },
        },
        {
            name: 'git_log',
            description: 'List recent commits on the current branch of the session workspace, optionally restricted to one path. Read-only.',
            parameters: schema({
                limit: { type: 'number', description: 'How many commits to return; defaults to 20, capped at 200.' },
                path: { type: 'string', description: 'Restrict the history to one path.' },
            }, []),
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(args, exec) {
                const sessionId = sessionOf(exec);
                if (sessionId === undefined)
                    return JSON.stringify({ error: 'this call has no session' });
                const commits = await service.log(sessionId, '', count(args.limit, 20, 200), typeof args.path === 'string' ? args.path : '', exec.signal);
                return JSON.stringify({ commits });
            },
        },
    ];
}
/**
 * Register the read-only git tools.
 *
 * @param ctx - the host context that carries the tools registry.
 * @param service - the git service the tools read.
 */
export function registerGitTools(ctx, service) {
    ctx.inject(['tools'], (scope) => {
        const registry = scope.tools;
        const disposers = definitions(service).map((definition) => registry.register(definition));
        return () => {
            for (const dispose of disposers.reverse())
                dispose();
        };
    });
}
//# sourceMappingURL=tools.js.map