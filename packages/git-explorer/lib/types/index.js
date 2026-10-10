var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { runGit } from './git/commands.js';
import { resolveRoot } from './git/repo.js';
import { parsePorcelainV2, toStatusSummary } from './git/status.js';
import { commitArgs, discardTrackedArgs, discardUntrackedArgs, runMutation, stageArgs, unstageArgs, } from './git/mutations.js';
import { readFileDiff } from './git/diff.js';
import { readStats } from './git/numstat.js';
import { readLog } from './git/log.js';
import { registerGitTools } from './tools.js';
/** The plugin's own version, reported to the panel so a build is identifiable. */
const PACKAGE_VERSION = '0.1.0-m5';
/** `rev-parse` output that locates the repository. */
const REV_PARSE_ARGS = ['rev-parse', '--show-toplevel', '--absolute-git-dir'];
/** The status read: porcelain v2 is NUL-separated and never quotes paths. */
const STATUS_ARGS = ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'];
/** Marker refs whose presence names the operation in progress, in precedence order. */
const OPERATION_REFS = [
    ['MERGE_HEAD', 'merge'],
    ['REBASE_HEAD', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
];
let GitExplorerService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _status_decorators;
    let _log_decorators;
    let _patch_decorators;
    let _fileStats_decorators;
    let _fileDiff_decorators;
    let _stage_decorators;
    let _unstage_decorators;
    let _discard_decorators;
    let _commit_decorators;
    let _ping_decorators;
    return class GitExplorerService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _status_decorators = [Remote];
            _log_decorators = [Remote];
            _patch_decorators = [Remote];
            _fileStats_decorators = [Remote];
            _fileDiff_decorators = [Remote];
            _stage_decorators = [Remote];
            _unstage_decorators = [Remote];
            _discard_decorators = [Remote];
            _commit_decorators = [Remote];
            _ping_decorators = [Remote];
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _log_decorators, { kind: "method", name: "log", static: false, private: false, access: { has: obj => "log" in obj, get: obj => obj.log }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _patch_decorators, { kind: "method", name: "patch", static: false, private: false, access: { has: obj => "patch" in obj, get: obj => obj.patch }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _fileStats_decorators, { kind: "method", name: "fileStats", static: false, private: false, access: { has: obj => "fileStats" in obj, get: obj => obj.fileStats }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _fileDiff_decorators, { kind: "method", name: "fileDiff", static: false, private: false, access: { has: obj => "fileDiff" in obj, get: obj => obj.fileDiff }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stage_decorators, { kind: "method", name: "stage", static: false, private: false, access: { has: obj => "stage" in obj, get: obj => obj.stage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _unstage_decorators, { kind: "method", name: "unstage", static: false, private: false, access: { has: obj => "unstage" in obj, get: obj => obj.unstage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _discard_decorators, { kind: "method", name: "discard", static: false, private: false, access: { has: obj => "discard" in obj, get: obj => obj.discard }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commit_decorators, { kind: "method", name: "commit", static: false, private: false, access: { has: obj => "commit" in obj, get: obj => obj.commit }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ping_decorators, { kind: "method", name: "ping", static: false, private: false, access: { has: obj => "ping" in obj, get: obj => obj.ping }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /**
         * Services this half waits for before it applies.
         *
         * Declaring them is not what grants access: Cordis refuses a property read such as
         * `ctx.sessions` unless the read happens on a context that *injected* the service, so
         * the working scope is captured through `ctx.inject` below — the same shape the shipped
         * Remote services use. Without that scope the guard throws
         * `cannot get property "sessions" without inject` inside the Remote call.
         */
        static inject = ['subprocess', 'sessions'];
        static Config = z.object({
            gitPath: z.string().default('git'),
            timeoutMs: z.number().step(1).min(1).default(30_000),
            outputMaxBytes: z.number().step(1).min(1).default(8 * 1024 * 1024),
            maxFiles: z.number().step(1).min(1).default(2_000),
            maxFileBytes: z.number().step(1).min(1).default(2 * 1024 * 1024),
        });
        limits = __runInitializers(this, _instanceExtraInitializers);
        /** The injected scope every git read runs on; undefined until the services exist. */
        scope;
        /** `git --version`, probed once per process after the first successful read. */
        gitVersion;
        /**
         * @param ctx - host context carrying `subprocess` and the Session store.
         * @param config - how git is invoked and how much output is retained.
         */
        constructor(ctx, config) {
            super(ctx, 'git');
            this.limits = config;
            ctx.inject(['subprocess', 'sessions'], (scope) => {
                this.scope = scope;
                return () => {
                    this.scope = undefined;
                };
            });
            // The read-only agent tools read the same service the panel does.
            registerGitTools(ctx, this);
        }
        /**
         * Read the working-tree state for one Session.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers when the host's own
         *   Session lookup cannot answer; empty string when the panel has nothing to offer.
         * @param signal - the invocation's cancellation signal, injected by the gateway.
         * @returns the status summary the panel renders.
         */
        async status(sessionId, requestRoot, signal) {
            const scope = this.scope;
            const resolved = scope === undefined
                ? { root: requestRoot === '' ? null : requestRoot, source: requestRoot === '' ? 'none' : 'request', sessionFound: false, note: 'the host git services are not available yet' }
                : await resolveRoot(scope, sessionId, requestRoot);
            const empty = (note, isRepo) => ({
                isRepo,
                root: resolved.root,
                rootSource: resolved.source,
                gitVersion: this.gitVersion ?? null,
                operation: null,
                branch: null,
                detached: false,
                unborn: false,
                upstream: null,
                ahead: 0,
                behind: 0,
                staged: [],
                unstaged: [],
                untracked: [],
                conflicted: [],
                truncated: false,
                skipped: [],
                note,
            });
            if (scope === undefined)
                return empty(resolved.note, false);
            if (resolved.root === null)
                return empty(resolved.note, false);
            const version = await this.readGitVersion(scope, resolved.root, signal);
            if (version === null) {
                return empty(resolved.note === '' ? 'git could not be executed' : resolved.note, false);
            }
            const located = await runGit(scope, this.limits, {
                cwd: resolved.root,
                args: [...REV_PARSE_ARGS],
                signal,
            });
            if (located.exitCode !== 0) {
                const reason = located.stderr.trim().split('\n')[0] ?? 'git could not locate a repository';
                return empty(reason.slice(0, 200), false);
            }
            const [toplevel] = located.stdout.split('\n');
            const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel;
            const read = await runGit(scope, this.limits, {
                cwd: root,
                args: [...STATUS_ARGS],
                signal,
            });
            if (read.exitCode !== 0) {
                return empty((read.stderr.trim().split('\n')[0] ?? 'git status failed').slice(0, 200), true);
            }
            const parsed = parsePorcelainV2(read.stdout, { maxFiles: this.limits.maxFiles });
            const note = parsed.truncated
                ? `listing cut at ${String(this.limits.maxFiles)} entries`
                : parsed.skipped.length > 0
                    ? `${String(parsed.skipped.length)} unrecognized record(s) ignored`
                    : '';
            return toStatusSummary(parsed, {
                isRepo: true,
                root,
                rootSource: resolved.source,
                operation: await this.detectOperation(scope, root, signal),
                gitVersion: version,
                note,
            });
        }
        /**
         * Read the most recent commits on the current branch.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param limit - how many commits to return.
         * @param path - restrict the history to one path; empty string means the whole branch.
         * @param signal - the invocation's cancellation signal.
         * @returns the commits, newest first.
         */
        async log(sessionId, requestRoot, limit, path, signal) {
            const root = await this.repositoryRoot(sessionId, requestRoot, signal);
            if (root === null)
                return [];
            const capped = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20;
            return await readLog(this.scope ?? this.ctx, this.limits, { root, limit: capped, path, signal });
        }
        /**
         * Read the unified patch for one changed file, as the model reads diffs.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param path - the repository-relative path.
         * @param staged - true to compare the index against HEAD.
         * @param signal - the invocation's cancellation signal.
         * @returns the patch text, or the reason there is none.
         */
        async patch(sessionId, requestRoot, path, staged, signal) {
            const scope = this.scope;
            if (scope === undefined)
                return { path, patch: '', note: 'the host git services are not available yet' };
            const root = await this.repositoryRoot(sessionId, requestRoot, signal);
            if (root === null)
                return { path, patch: '', note: 'no repository resolved for this Session' };
            const args = staged
                ? ['diff', '--cached', '--no-color', '--no-ext-diff', '-U3', '--', path]
                : ['diff', '--no-color', '--no-ext-diff', '-U3', '--', path];
            const result = await runGit(scope, this.limits, { cwd: root, args, signal });
            if (result.exitCode !== 0) {
                return { path, patch: '', note: (result.stderr.trim().split('\n')[0] ?? 'git diff failed').slice(0, 200) };
            }
            const note = result.stdoutLossy ? 'the patch exceeded the output cap and was cut' : '';
            return { path, patch: result.stdout, note };
        }
        /**
         * Resolve the repository root for one Session, or null when there is none.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param signal - caller cancellation.
         * @returns the repository's top level.
         */
        async repositoryRoot(sessionId, requestRoot, signal) {
            const scope = this.scope;
            if (scope === undefined)
                return null;
            const resolved = await resolveRoot(scope, sessionId, requestRoot);
            if (resolved.root === null)
                return null;
            const located = await runGit(scope, this.limits, {
                cwd: resolved.root,
                args: [...REV_PARSE_ARGS],
                signal,
            });
            if (located.exitCode !== 0)
                return null;
            const [toplevel] = located.stdout.split('\n');
            return toplevel === undefined || toplevel === '' ? resolved.root : toplevel;
        }
        /**
         * Read the per-file line counts both comparisons report.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param signal - the invocation's cancellation signal.
         * @returns one entry per changed path, or none when the repository cannot be read.
         */
        async fileStats(sessionId, requestRoot, signal) {
            const scope = this.scope;
            if (scope === undefined)
                return [];
            const resolved = await resolveRoot(scope, sessionId, requestRoot);
            if (resolved.root === null)
                return [];
            const located = await runGit(scope, this.limits, {
                cwd: resolved.root,
                args: [...REV_PARSE_ARGS],
                signal,
            });
            if (located.exitCode !== 0)
                return [];
            const [toplevel] = located.stdout.split('\n');
            const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel;
            return await readStats(scope, this.limits, { root, signal });
        }
        /**
         * Read both sides of one changed file for the diff view.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param path - the repository-relative path.
         * @param staged - true to compare the index against HEAD instead of the work tree.
         * @param untracked - true when git does not track the path yet (no old side).
         * @param signal - the invocation's cancellation signal.
         * @returns the two sides, or the flags explaining why they are not shown.
         */
        async fileDiff(sessionId, requestRoot, path, staged, untracked, signal) {
            const empty = (note) => ({
                // The root is filled in once it is known; an empty one means the read never got that far.
                path, root: '', staged, oldText: '', newText: '', binary: false, oversized: false, note,
            });
            const scope = this.scope;
            if (scope === undefined)
                return empty('the host git services are not available yet');
            const resolved = await resolveRoot(scope, sessionId, requestRoot);
            if (resolved.root === null)
                return empty(resolved.note);
            const located = await runGit(scope, this.limits, {
                cwd: resolved.root,
                args: [...REV_PARSE_ARGS],
                signal,
            });
            if (located.exitCode !== 0) {
                return empty((located.stderr.trim().split('\n')[0] ?? 'not a git repository').slice(0, 200));
            }
            const [toplevel] = located.stdout.split('\n');
            const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel;
            return await readFileDiff(scope, this.limits, {
                root,
                path,
                staged,
                untracked,
                maxFileBytes: this.limits.maxFileBytes,
                signal,
            });
        }
        /**
         * Stage the given paths.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param paths - repository-relative paths, as the panel rendered them.
         * @param signal - the invocation's cancellation signal.
         * @returns what the mutation did.
         */
        async stage(sessionId, requestRoot, paths, signal) {
            return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({ cwd, args: stageArgs(paths) }));
        }
        /**
         * Unstage the given paths, leaving the work tree untouched.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param paths - repository-relative paths.
         * @param signal - the invocation's cancellation signal.
         * @returns what the mutation did.
         */
        async unstage(sessionId, requestRoot, paths, signal) {
            return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({ cwd, args: unstageArgs(paths) }));
        }
        /**
         * Discard work-tree changes.
         *
         * Destructive, so the caller must pass `confirmed` after asking the person; without it
         * the call is refused rather than performed. Tracked paths are restored from the index
         * and untracked ones are removed, because git spells those two operations differently.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param trackedPaths - paths git already tracks.
         * @param untrackedPaths - paths git does not track yet.
         * @param confirmed - true only after an explicit confirmation.
         * @param signal - the invocation's cancellation signal.
         * @returns what the mutations did.
         */
        async discard(sessionId, requestRoot, trackedPaths, untrackedPaths, confirmed, signal) {
            if (!confirmed) {
                return { ok: false, detail: 'discarding changes requires an explicit confirmation' };
            }
            const details = [];
            if (trackedPaths.length > 0) {
                const restored = await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
                    cwd,
                    args: discardTrackedArgs(trackedPaths),
                }));
                if (!restored.ok)
                    return restored;
                details.push(`restored ${String(trackedPaths.length)} tracked file(s)`);
            }
            if (untrackedPaths.length > 0) {
                const removed = await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
                    cwd,
                    args: discardUntrackedArgs(untrackedPaths),
                }));
                if (!removed.ok)
                    return removed;
                details.push(`removed ${String(untrackedPaths.length)} untracked file(s)`);
            }
            if (details.length === 0)
                return { ok: false, detail: 'nothing to discard' };
            return { ok: true, detail: details.join('; ') };
        }
        /**
         * Commit the index.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param message - the commit message; it travels on stdin.
         * @param amend - true to replace the previous commit.
         * @param signal - the invocation's cancellation signal.
         * @returns what the commit did, including git's own refusals (nothing staged, no identity).
         */
        async commit(sessionId, requestRoot, message, amend, signal) {
            if (message.trim() === '')
                return { ok: false, detail: 'a commit message is required' };
            return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
                cwd,
                args: commitArgs({ amend }),
                stdin: message,
            }));
        }
        /**
         * Resolve the repository and run one mutation in it.
         *
         * @param sessionId - the Session identity received on the wire.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param signal - caller cancellation.
         * @param build - how to spell the command once the directory is known.
         * @returns what the mutation did.
         */
        async mutate(sessionId, requestRoot, signal, build) {
            const scope = this.scope;
            if (scope === undefined)
                return { ok: false, detail: 'the host git services are not available yet' };
            const resolved = await resolveRoot(scope, sessionId, requestRoot);
            if (resolved.root === null)
                return { ok: false, detail: resolved.note };
            const located = await runGit(scope, this.limits, {
                cwd: resolved.root,
                args: [...REV_PARSE_ARGS],
                signal,
            });
            if (located.exitCode !== 0) {
                return { ok: false, detail: (located.stderr.trim().split('\n')[0] ?? 'not a git repository').slice(0, 200) };
            }
            const [toplevel] = located.stdout.split('\n');
            const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel;
            const command = build(root);
            return await runMutation(scope, this.limits, {
                cwd: command.cwd,
                args: command.args,
                ...(command.stdin === undefined ? {} : { stdin: command.stdin }),
                signal,
            });
        }
        /**
         * Report what the host can see for this Session: the plugin build, git itself, and
         * the working directory the Session resolves to. Kept beside {@link status} as the
         * diagnostic entry point a panel shows when the repository read fails.
         *
         * @param sessionId - the Session whose working directory is inspected.
         * @param requestRoot - the working directory the panel offers, if any.
         * @param signal - the invocation's cancellation signal, injected by the gateway.
         * @returns the bridge probe result.
         */
        async ping(sessionId, requestRoot, signal) {
            const scope = this.scope;
            const resolved = scope === undefined
                ? { root: requestRoot === '' ? null : requestRoot, source: requestRoot === '' ? 'none' : 'request', sessionFound: false, note: 'the host git services are not available yet' }
                : await resolveRoot(scope, sessionId, requestRoot);
            const gitVersion = scope === undefined || resolved.root === null
                ? null
                : await this.readGitVersion(scope, resolved.root, signal);
            return {
                ok: true,
                packageVersion: PACKAGE_VERSION,
                gitVersion,
                cwd: resolved.root,
                remote: true,
                sessionFound: resolved.sessionFound,
                cwdSource: resolved.source,
                note: resolved.note,
            };
        }
        /**
         * Probe `git --version` once and remember the answer for this process.
         *
         * @param scope - the injected host scope.
         * @param cwd - a directory to run the probe in.
         * @param signal - caller cancellation.
         * @returns the version line, or null when git could not run.
         */
        async readGitVersion(scope, cwd, signal) {
            if (this.gitVersion !== undefined)
                return this.gitVersion;
            try {
                const result = await runGit(scope, this.limits, { cwd, args: ['--version'], signal });
                this.gitVersion = result.exitCode === 0 ? result.stdout.trim() : null;
            }
            catch {
                this.gitVersion = null;
            }
            return this.gitVersion;
        }
        /**
         * Name the operation in progress, read from git's marker refs.
         *
         * @param scope - the injected host scope.
         * @param root - the repository root.
         * @param signal - caller cancellation.
         * @returns the operation name, or null when the work tree is in a plain state.
         */
        async detectOperation(scope, root, signal) {
            for (const [ref, operation] of OPERATION_REFS) {
                try {
                    const probe = await runGit(scope, this.limits, {
                        cwd: root,
                        args: ['rev-parse', '-q', '--verify', ref],
                        signal,
                    });
                    if (probe.exitCode === 0)
                        return operation;
                }
                catch {
                    // A probe that cannot run leaves the operation unknown rather than failing the read.
                }
            }
            return null;
        }
    };
})();
export { GitExplorerService };
/**
 * The loader mounts the package by its default export; the named export above is what
 * the Typert analyzer walks (it enumerates named public exports only, and a
 * default-only class is invisible to it).
 */
export default GitExplorerService;
//# sourceMappingURL=index.js.map