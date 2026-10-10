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
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { runGit, type GitCommandLimits } from './git/commands.js'
import { resolveRoot } from './git/repo.js'
import { parsePorcelainV2, toStatusSummary } from './git/status.js'
import {
  commitArgs,
  discardTrackedArgs,
  discardUntrackedArgs,
  runMutation,
  stageArgs,
  unstageArgs,
} from './git/mutations.js'
import type { GitFileDiff, GitMutationResult, GitPingResult, GitStatusSummary } from './types.js'
import { readFileDiff } from './git/diff.js'

/**
 * Declare this package as the owner of the `git` Host service. Besides giving Host
 * consumers a typed handle, this augmentation is what makes the package a Typert
 * contributor: the generator discovers packages by walking public exports reachable
 * from Cordis `Context` augmentations, exactly as the shipped Remote services do.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `git` Remote namespace. */
    git: GitExplorerService
  }
}

/** The plugin's own version, reported to the panel so a build is identifiable. */
const PACKAGE_VERSION = '0.1.0-m3'

/** `rev-parse` output that locates the repository. */
const REV_PARSE_ARGS = ['rev-parse', '--show-toplevel', '--absolute-git-dir'] as const

/** The status read: porcelain v2 is NUL-separated and never quotes paths. */
const STATUS_ARGS = ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'] as const

/** Marker refs whose presence names the operation in progress, in precedence order. */
const OPERATION_REFS: ReadonlyArray<readonly [string, string]> = [
  ['MERGE_HEAD', 'merge'],
  ['REBASE_HEAD', 'rebase'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
]

/** The resolved plugin configuration. */
export interface GitExplorerConfig extends GitCommandLimits {
  /** Cap on entries carried by one status read. */
  maxFiles: number
  /** Cap on one side of a file comparison; a larger side is reported, not truncated. */
  maxFileBytes: number
}

export class GitExplorerService extends TypertRemoteService {
  /**
   * Services this half waits for before it applies.
   *
   * Declaring them is not what grants access: Cordis refuses a property read such as
   * `ctx.sessions` unless the read happens on a context that *injected* the service, so
   * the working scope is captured through `ctx.inject` below — the same shape the shipped
   * Remote services use. Without that scope the guard throws
   * `cannot get property "sessions" without inject` inside the Remote call.
   */
  static inject = ['subprocess', 'sessions']

  static Config = z.object({
    gitPath: z.string().default('git'),
    timeoutMs: z.number().step(1).min(1).default(30_000),
    outputMaxBytes: z.number().step(1).min(1).default(8 * 1024 * 1024),
    maxFiles: z.number().step(1).min(1).default(2_000),
    maxFileBytes: z.number().step(1).min(1).default(2 * 1024 * 1024),
  })

  private readonly limits: GitExplorerConfig

  /** The injected scope every git read runs on; undefined until the services exist. */
  private scope: Context | undefined

  /** `git --version`, probed once per process after the first successful read. */
  private gitVersion: string | null | undefined

  /**
   * @param ctx - host context carrying `subprocess` and the Session store.
   * @param config - how git is invoked and how much output is retained.
   */
  constructor(ctx: Context, config: GitExplorerConfig) {
    super(ctx, 'git')
    this.limits = config
    ctx.inject(['subprocess', 'sessions'], (scope) => {
      this.scope = scope
      return () => {
        this.scope = undefined
      }
    })
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
  @Remote
  async status(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<GitStatusSummary> {
    const scope = this.scope
    const resolved = scope === undefined
      ? { root: requestRoot === '' ? null : requestRoot, source: requestRoot === '' ? 'none' as const : 'request' as const, sessionFound: false, note: 'the host git services are not available yet' }
      : await resolveRoot(scope, sessionId, requestRoot)
    const empty = (note: string, isRepo: boolean): GitStatusSummary => ({
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
    })

    if (scope === undefined) return empty(resolved.note, false)
    if (resolved.root === null) return empty(resolved.note, false)

    const version = await this.readGitVersion(scope, resolved.root, signal)
    if (version === null) {
      return empty(resolved.note === '' ? 'git could not be executed' : resolved.note, false)
    }

    const located = await runGit(scope, this.limits, {
      cwd: resolved.root,
      args: [...REV_PARSE_ARGS],
      signal,
    })
    if (located.exitCode !== 0) {
      const reason = located.stderr.trim().split('\n')[0] ?? 'git could not locate a repository'
      return empty(reason.slice(0, 200), false)
    }

    const [toplevel] = located.stdout.split('\n')
    const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel

    const read = await runGit(scope, this.limits, {
      cwd: root,
      args: [...STATUS_ARGS],
      signal,
    })
    if (read.exitCode !== 0) {
      return empty((read.stderr.trim().split('\n')[0] ?? 'git status failed').slice(0, 200), true)
    }

    const parsed = parsePorcelainV2(read.stdout, { maxFiles: this.limits.maxFiles })
    const note = parsed.truncated
      ? `listing cut at ${String(this.limits.maxFiles)} entries`
      : parsed.skipped.length > 0
        ? `${String(parsed.skipped.length)} unrecognized record(s) ignored`
        : ''

    return toStatusSummary(parsed, {
      isRepo: true,
      root,
      rootSource: resolved.source,
      operation: await this.detectOperation(scope, root, signal),
      gitVersion: version,
      note,
    })
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
  @Remote
  async fileDiff(
    sessionId: string,
    requestRoot: string,
    path: string,
    staged: boolean,
    untracked: boolean,
    signal: AbortSignal,
  ): Promise<GitFileDiff> {
    const empty = (note: string): GitFileDiff => ({
      path, staged, oldText: '', newText: '', binary: false, oversized: false, note,
    })
    const scope = this.scope
    if (scope === undefined) return empty('the host git services are not available yet')

    const resolved = await resolveRoot(scope, sessionId, requestRoot)
    if (resolved.root === null) return empty(resolved.note)

    const located = await runGit(scope, this.limits, {
      cwd: resolved.root,
      args: [...REV_PARSE_ARGS],
      signal,
    })
    if (located.exitCode !== 0) {
      return empty((located.stderr.trim().split('\n')[0] ?? 'not a git repository').slice(0, 200))
    }
    const [toplevel] = located.stdout.split('\n')
    const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel

    return await readFileDiff(scope, this.limits, {
      root,
      path,
      staged,
      untracked,
      maxFileBytes: this.limits.maxFileBytes,
      signal,
    })
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
  @Remote
  async stage(
    sessionId: string,
    requestRoot: string,
    paths: string[],
    signal: AbortSignal,
  ): Promise<GitMutationResult> {
    return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({ cwd, args: stageArgs(paths) }))
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
  @Remote
  async unstage(
    sessionId: string,
    requestRoot: string,
    paths: string[],
    signal: AbortSignal,
  ): Promise<GitMutationResult> {
    return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({ cwd, args: unstageArgs(paths) }))
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
  @Remote
  async discard(
    sessionId: string,
    requestRoot: string,
    trackedPaths: string[],
    untrackedPaths: string[],
    confirmed: boolean,
    signal: AbortSignal,
  ): Promise<GitMutationResult> {
    if (!confirmed) {
      return { ok: false, detail: 'discarding changes requires an explicit confirmation' }
    }
    const details: string[] = []
    if (trackedPaths.length > 0) {
      const restored = await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
        cwd,
        args: discardTrackedArgs(trackedPaths),
      }))
      if (!restored.ok) return restored
      details.push(`restored ${String(trackedPaths.length)} tracked file(s)`)
    }
    if (untrackedPaths.length > 0) {
      const removed = await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
        cwd,
        args: discardUntrackedArgs(untrackedPaths),
      }))
      if (!removed.ok) return removed
      details.push(`removed ${String(untrackedPaths.length)} untracked file(s)`)
    }
    if (details.length === 0) return { ok: false, detail: 'nothing to discard' }
    return { ok: true, detail: details.join('; ') }
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
  @Remote
  async commit(
    sessionId: string,
    requestRoot: string,
    message: string,
    amend: boolean,
    signal: AbortSignal,
  ): Promise<GitMutationResult> {
    if (message.trim() === '') return { ok: false, detail: 'a commit message is required' }
    return await this.mutate(sessionId, requestRoot, signal, (cwd) => ({
      cwd,
      args: commitArgs({ amend }),
      stdin: message,
    }))
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
  private async mutate(
    sessionId: string,
    requestRoot: string,
    signal: AbortSignal,
    build: (cwd: string) => { cwd: string; args: readonly string[]; stdin?: string },
  ): Promise<GitMutationResult> {
    const scope = this.scope
    if (scope === undefined) return { ok: false, detail: 'the host git services are not available yet' }
    const resolved = await resolveRoot(scope, sessionId, requestRoot)
    if (resolved.root === null) return { ok: false, detail: resolved.note }

    const located = await runGit(scope, this.limits, {
      cwd: resolved.root,
      args: [...REV_PARSE_ARGS],
      signal,
    })
    if (located.exitCode !== 0) {
      return { ok: false, detail: (located.stderr.trim().split('\n')[0] ?? 'not a git repository').slice(0, 200) }
    }
    const [toplevel] = located.stdout.split('\n')
    const root = toplevel === undefined || toplevel === '' ? resolved.root : toplevel

    const command = build(root)
    return await runMutation(scope, this.limits, {
      cwd: command.cwd,
      args: command.args,
      ...(command.stdin === undefined ? {} : { stdin: command.stdin }),
      signal,
    })
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
  @Remote
  async ping(sessionId: string, requestRoot: string, signal: AbortSignal): Promise<GitPingResult> {
    const scope = this.scope
    const resolved = scope === undefined
      ? { root: requestRoot === '' ? null : requestRoot, source: requestRoot === '' ? 'none' as const : 'request' as const, sessionFound: false, note: 'the host git services are not available yet' }
      : await resolveRoot(scope, sessionId, requestRoot)
    const gitVersion = scope === undefined || resolved.root === null
      ? null
      : await this.readGitVersion(scope, resolved.root, signal)
    return {
      ok: true,
      packageVersion: PACKAGE_VERSION,
      gitVersion,
      cwd: resolved.root,
      remote: true,
      sessionFound: resolved.sessionFound,
      cwdSource: resolved.source,
      note: resolved.note,
    }
  }

  /**
   * Probe `git --version` once and remember the answer for this process.
   *
   * @param scope - the injected host scope.
   * @param cwd - a directory to run the probe in.
   * @param signal - caller cancellation.
   * @returns the version line, or null when git could not run.
   */
  private async readGitVersion(scope: Context, cwd: string, signal: AbortSignal): Promise<string | null> {
    if (this.gitVersion !== undefined) return this.gitVersion
    try {
      const result = await runGit(scope, this.limits, { cwd, args: ['--version'], signal })
      this.gitVersion = result.exitCode === 0 ? result.stdout.trim() : null
    } catch {
      this.gitVersion = null
    }
    return this.gitVersion
  }

  /**
   * Name the operation in progress, read from git's marker refs.
   *
   * @param scope - the injected host scope.
   * @param root - the repository root.
   * @param signal - caller cancellation.
   * @returns the operation name, or null when the work tree is in a plain state.
   */
  private async detectOperation(scope: Context, root: string, signal: AbortSignal): Promise<string | null> {
    for (const [ref, operation] of OPERATION_REFS) {
      try {
        const probe = await runGit(scope, this.limits, {
          cwd: root,
          args: ['rev-parse', '-q', '--verify', ref],
          signal,
        })
        if (probe.exitCode === 0) return operation
      } catch {
        // A probe that cannot run leaves the operation unknown rather than failing the read.
      }
    }
    return null
  }
}

/**
 * The loader mounts the package by its default export; the named export above is what
 * the Typert analyzer walks (it enumerates named public exports only, and a
 * default-only class is invisible to it).
 */
export default GitExplorerService
