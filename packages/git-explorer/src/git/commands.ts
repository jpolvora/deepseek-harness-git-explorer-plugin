/**
 * The one place git runs.
 *
 * Shape copied from the shipped `@deepseek-ai/dsh-workspace-changes` git runner:
 * argv is never shell-interpreted, the environment is scrubbed of ambient git
 * configuration and credentials, output is bounded, and every command carries a
 * timeout that composes with the caller's signal.
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * The slice of `ctx.subprocess` this package uses, declared structurally.
 *
 * The type-only import of `@deepseek-ai/dsh-subprocess` is deliberately avoided:
 * loading it into the analyzed program drags unregistered packages into the
 * Typert program, and any declaration merge they carry from a face-scoped map
 * fails generation. Structural typing keeps the wire contract local and the
 * analyzed program closed.
 */
export interface SubprocessOutputRead {
  text: string
  lossy: boolean
}

export interface SubprocessHandle {
  done: Promise<{ exitCode: number | null }>
  collected: {
    stdout?: { readFrom(offset: number): SubprocessOutputRead }
    stderr?: { readFrom(offset: number): SubprocessOutputRead }
  }
}

export interface SubprocessSpawnSpec {
  argv: readonly string[]
  cwd: string
  stdio: {
    stdin: 'ignore' | { data: string }
    stdout: { maxBytes: number }
    stderr: { maxBytes: number }
  }
  graceMs: number
  signal: AbortSignal
  env: Record<string, string>
}

export interface SubprocessFace {
  spawn(spec: SubprocessSpawnSpec): SubprocessHandle
}

/** Read the structural subprocess face off a host context. */
function subprocessOf(ctx: Context): SubprocessFace {
  return (ctx as unknown as { subprocess: SubprocessFace }).subprocess
}

/** Deployment limits the service passes down from its Config. */
export interface GitCommandLimits {
  /** The git executable, resolved through PATH unless absolute. */
  gitPath: string
  /** Milliseconds one git command may run. */
  timeoutMs: number
  /** Bytes of stdout retained per command. */
  outputMaxBytes: number
}

/** One finished command. A non-zero exit is data, not an exception. */
export interface GitRunResult {
  exitCode: number
  stdout: string
  stderr: string
  /** True when stdout hit the byte cap and was truncated. */
  stdoutLossy: boolean
}

/** Options for one command. */
export interface GitRunOptions {
  cwd: string
  args: readonly string[]
  /** Written to the command's stdin, for messages that must not ride in argv. */
  stdin?: string
  signal?: AbortSignal
}

/**
 * Run one git command and collect its output.
 *
 * @param ctx - host context carrying `subprocess`.
 * @param limits - the service's configured caps.
 * @param options - the command and where it runs.
 * @returns the exit code and captured output.
 */
export async function runGit(
  ctx: Context,
  limits: GitCommandLimits,
  options: GitRunOptions,
): Promise<GitRunResult> {
  const timeout = AbortSignal.timeout(limits.timeoutMs)
  const signal = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout])
  const handle = subprocessOf(ctx).spawn({
    argv: [limits.gitPath, ...options.args],
    cwd: options.cwd,
    stdio: {
      stdin: options.stdin === undefined ? 'ignore' : { data: options.stdin },
      stdout: { maxBytes: limits.outputMaxBytes },
      stderr: { maxBytes: 16 * 1024 },
    },
    graceMs: 2_000,
    signal,
    env: {
      GIT_CONFIG_COUNT: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  })
  const outcome = await handle.done
  const stdout = handle.collected.stdout?.readFrom(0)
  const stderr = handle.collected.stderr?.readFrom(0)
  // `DSH_GIT_EXPLORER_DEBUG=1` traces every command the plugin runs, which is how a
  // mutation that reports success without changing anything gets found.
  if (process.env.DSH_GIT_EXPLORER_DEBUG === '1') {
    console.error(`[git-explorer] cwd=${options.cwd} $ git ${options.args.join(' ')} -> ${String(outcome.exitCode ?? -1)}`)
    if (stderr?.text !== undefined && stderr.text.trim() !== '') console.error(`[git-explorer] stderr: ${stderr.text.trim()}`)
  }
  return {
    // A command killed by a signal reports no exit code; surface it as a failure
    // so callers never mistake it for success.
    exitCode: outcome.exitCode ?? -1,
    stdout: stdout?.text ?? '',
    stderr: stderr?.text ?? '',
    stdoutLossy: stdout?.lossy ?? false,
  }
}
