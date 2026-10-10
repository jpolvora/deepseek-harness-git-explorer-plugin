/** Read the structural subprocess face off a host context. */
function subprocessOf(ctx) {
    return ctx.subprocess;
}
/**
 * Run one git command and collect its output.
 *
 * @param ctx - host context carrying `subprocess`.
 * @param limits - the service's configured caps.
 * @param options - the command and where it runs.
 * @returns the exit code and captured output.
 */
export async function runGit(ctx, limits, options) {
    const timeout = AbortSignal.timeout(limits.timeoutMs);
    const signal = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
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
    });
    const outcome = await handle.done;
    const stdout = handle.collected.stdout?.readFrom(0);
    const stderr = handle.collected.stderr?.readFrom(0);
    return {
        // A command killed by a signal reports no exit code; surface it as a failure
        // so callers never mistake it for success.
        exitCode: outcome.exitCode ?? -1,
        stdout: stdout?.text ?? '',
        stderr: stderr?.text ?? '',
        stdoutLossy: stdout?.lossy ?? false,
    };
}
//# sourceMappingURL=commands.js.map