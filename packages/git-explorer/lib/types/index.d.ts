/**
 * The Git Explorer host half.
 *
 * One class carries the Host service and its Remote namespace: `super(ctx, 'git')`
 * binds the wire namespace, so the client calls `remote.git.*`. This mirrors the
 * shipped `@deepseek-ai/dsh-api-workspace-files` shape, which is the live proof that a
 * package root can be a loader row, a Host plugin and a browser row at once.
 *
 * M1 exposes the read-only working-tree state the panel renders. Every git command
 * goes through {@link runGit}, which carries the shipped runner's guarantees: argv is
 * never shell-interpreted, ambient git configuration and credentials are scrubbed,
 * output is bounded, and a timeout composes with the caller's signal.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type GitCommandLimits } from './git/commands.js';
import type { GitMutationResult, GitPingResult, GitStatusSummary } from './types.js';
/**
 * Declare this package as the owner of the `git` Host service. Besides giving Host
 * consumers a typed handle, this augmentation is what makes the package a Typert
 * contributor: the generator discovers packages by walking public exports reachable
 * from Cordis `Context` augmentations, exactly as the shipped Remote services do.
 */
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host owner of the `git` Remote namespace. */
        git: GitExplorerService;
    }
}
/** The resolved plugin configuration. */
export interface GitExplorerConfig extends GitCommandLimits {
    /** Cap on entries carried by one status read. */
    maxFiles: number;
}
export declare class GitExplorerService extends TypertRemoteService {
    /**
     * Services this half waits for before it applies.
     *
     * Declaring them is not what grants access: Cordis refuses a property read such as
     * `ctx.sessions` unless the read happens on a context that *injected* the service, so
     * the working scope is captured through `ctx.inject` below — the same shape the shipped
     * Remote services use. Without that scope the guard throws
     * `cannot get property "sessions" without inject` inside the Remote call.
     */
    static inject: string[];
    static Config: z<Schemastery.ObjectS<NoInfer<{
        gitPath: z<string, string, "defined">;
        timeoutMs: z<number, number, "defined">;
        outputMaxBytes: z<number, number, "defined">;
        maxFiles: z<number, number, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        gitPath: z<string, string, "defined">;
        timeoutMs: z<number, number, "defined">;
        outputMaxBytes: z<number, number, "defined">;
        maxFiles: z<number, number, "defined">;
    }>>, "plain">;
    private readonly limits;
    /** The injected scope every git read runs on; undefined until the services exist. */
    private scope;
    /** `git --version`, probed once per process after the first successful read. */
    private gitVersion;
    /**
     * @param ctx - host context carrying `subprocess` and the Session store.
     * @param config - how git is invoked and how much output is retained.
     */
    constructor(ctx: Context, config: GitExplorerConfig);
    /**
     * Read the working-tree state for one Session.
     *
     * @param sessionId - the Session identity received on the wire.
     * @param requestRoot - the working directory the panel offers when the host's own
     *   Session lookup cannot answer; empty string when the panel has nothing to offer.
     * @param signal - the invocation's cancellation signal, injected by the gateway.
     * @returns the status summary the panel renders.
     */
    status(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<GitStatusSummary>;
    /**
     * Stage the given paths.
     *
     * @param sessionId - the Session identity received on the wire.
     * @param requestRoot - the working directory the panel offers, if any.
     * @param paths - repository-relative paths, as the panel rendered them.
     * @param signal - the invocation's cancellation signal.
     * @returns what the mutation did.
     */
    stage(sessionId: string, requestRoot: string, paths: string[], signal: AbortSignal): Promise<GitMutationResult>;
    /**
     * Unstage the given paths, leaving the work tree untouched.
     *
     * @param sessionId - the Session identity received on the wire.
     * @param requestRoot - the working directory the panel offers, if any.
     * @param paths - repository-relative paths.
     * @param signal - the invocation's cancellation signal.
     * @returns what the mutation did.
     */
    unstage(sessionId: string, requestRoot: string, paths: string[], signal: AbortSignal): Promise<GitMutationResult>;
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
    discard(sessionId: string, requestRoot: string, trackedPaths: string[], untrackedPaths: string[], confirmed: boolean, signal: AbortSignal): Promise<GitMutationResult>;
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
    commit(sessionId: string, requestRoot: string, message: string, amend: boolean, signal: AbortSignal): Promise<GitMutationResult>;
    /**
     * Resolve the repository and run one mutation in it.
     *
     * @param sessionId - the Session identity received on the wire.
     * @param requestRoot - the working directory the panel offers, if any.
     * @param signal - caller cancellation.
     * @param build - how to spell the command once the directory is known.
     * @returns what the mutation did.
     */
    private mutate;
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
    ping(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<GitPingResult>;
    /**
     * Probe `git --version` once and remember the answer for this process.
     *
     * @param scope - the injected host scope.
     * @param cwd - a directory to run the probe in.
     * @param signal - caller cancellation.
     * @returns the version line, or null when git could not run.
     */
    private readGitVersion;
    /**
     * Name the operation in progress, read from git's marker refs.
     *
     * @param scope - the injected host scope.
     * @param root - the repository root.
     * @param signal - caller cancellation.
     * @returns the operation name, or null when the work tree is in a plain state.
     */
    private detectOperation;
}
/**
 * The loader mounts the package by its default export; the named export above is what
 * the Typert analyzer walks (it enumerates named public exports only, and a
 * default-only class is invisible to it).
 */
export default GitExplorerService;
