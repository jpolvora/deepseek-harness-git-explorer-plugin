/**
 * Per-file line counts for the change rows.
 *
 * `git diff --numstat -z` is the cheapest way to get additions and deletions per path:
 * one call per comparison, NUL-separated so paths with spaces survive, `-` for the
 * counts of a binary file.
 *
 * The parser is a pure function over the raw output, so the shapes git actually emits —
 * including a rename, whose old and new paths arrive as separate NUL tokens — are
 * unit-testable without running git.
 */
import type { Context } from '@deepseek-ai/cordis'
import { runGit, type GitCommandLimits } from './commands.js'
import type { GitChangeStats } from '../types.js'

/** The two comparisons a panel row can belong to. */
const NUMSTAT_ARGS = {
  unstaged: ['diff', '--numstat', '-z', '--no-renames'] as const,
  staged: ['diff', '--cached', '--numstat', '-z', '--no-renames'] as const,
}

/**
 * Parse one numstat stream.
 *
 * @param output - raw stdout of `git diff --numstat -z`.
 * @param staged - which comparison these counts belong to.
 * @returns one entry per changed path.
 */
export function parseNumstat(output: string, staged: boolean): GitChangeStats[] {
  const entries: GitChangeStats[] = []
  for (const token of output.split('\0')) {
    if (token === '') continue
    const firstTab = token.indexOf('\t')
    const secondTab = firstTab === -1 ? -1 : token.indexOf('\t', firstTab + 1)
    if (firstTab === -1 || secondTab === -1) continue
    const added = token.slice(0, firstTab)
    const removed = token.slice(firstTab + 1, secondTab)
    const path = token.slice(secondTab + 1)
    if (path === '') continue
    const binary = added === '-' || removed === '-'
    entries.push({
      path,
      staged,
      added: binary ? 0 : Number(added),
      removed: binary ? 0 : Number(removed),
      binary,
    })
  }
  return entries
}

/**
 * Read the line counts for both comparisons.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - the repository root and cancellation.
 * @returns the counts for the work tree and the index, in that order.
 */
export async function readStats(
  ctx: Context,
  limits: GitCommandLimits,
  options: { root: string; signal: AbortSignal },
): Promise<GitChangeStats[]> {
  const entries: GitChangeStats[] = []
  for (const [key, args] of Object.entries(NUMSTAT_ARGS)) {
    const staged = key === 'staged'
    try {
      const result = await runGit(ctx, limits, { cwd: options.root, args: [...args], signal: options.signal })
      if (result.exitCode === 0) entries.push(...parseNumstat(result.stdout, staged))
    } catch {
      // Counts are decoration: a failed read leaves the rows without numbers rather
      // than failing the whole status refresh.
    }
  }
  return entries
}
