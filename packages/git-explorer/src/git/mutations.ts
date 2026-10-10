/**
 * The mutating git verbs.
 *
 * Every argv is built here as a pure function so the exact command shape is unit-testable,
 * and every path list is terminated with `--` so a file whose name looks like an option
 * can never be read as one. Nothing here interpolates a shell: the runner passes argv
 * straight to the executable.
 *
 * Destructive verbs (`discard`) require an explicit confirmation flag from the caller, and
 * a commit refuses an empty message. Anything the repository refuses comes back as a
 * failure detail rather than an exception, so the panel can show git's own words.
 */
import type { Context } from '@deepseek-ai/cordis'
import { runGit, type GitCommandLimits } from './commands.js'

/** What one mutation did, in the panel's words. */
export interface GitMutationOutcome {
  ok: boolean
  /** A short line: what happened, or the first line of git's refusal. */
  detail: string
}

/** Stage the given paths. */
export function stageArgs(paths: readonly string[]): string[] {
  return ['add', '--', ...paths]
}

/** Unstage the given paths, leaving the work tree untouched. */
export function unstageArgs(paths: readonly string[]): string[] {
  return ['restore', '--staged', '--', ...paths]
}

/** Restore tracked paths from the index, discarding their work-tree edits. */
export function discardTrackedArgs(paths: readonly string[]): string[] {
  return ['restore', '--', ...paths]
}

/** Remove untracked paths from the work tree. */
export function discardUntrackedArgs(paths: readonly string[]): string[] {
  return ['clean', '-f', '--', ...paths]
}

/** Commit the index; the message travels on stdin so quoting cannot bite. */
export function commitArgs(options: { amend: boolean }): string[] {
  return options.amend ? ['commit', '--amend', '-F', '-'] : ['commit', '-F', '-']
}

/** The first non-empty line of a git refusal. */
function firstLine(text: string, fallback: string): string {
  const line = text.trim().split('\n').map((candidate) => candidate.trim()).find((candidate) => candidate !== '')
  return (line ?? fallback).slice(0, 300)
}

/**
 * Run one mutating command.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the argv, the directory, optional stdin, and cancellation.
 * @returns the outcome the panel reports.
 */
export async function runMutation(
  ctx: Context,
  limits: GitCommandLimits,
  options: { cwd: string; args: readonly string[]; stdin?: string; signal: AbortSignal },
): Promise<GitMutationOutcome> {
  try {
    const result = await runGit(ctx, limits, {
      cwd: options.cwd,
      args: options.args,
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
      signal: options.signal,
    })
    if (result.exitCode === 0) {
      return { ok: true, detail: firstLine(result.stdout, 'done') }
    }
    return { ok: false, detail: firstLine(result.stderr, `git exited ${String(result.exitCode)}`) }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}
