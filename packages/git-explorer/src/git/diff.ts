/**
 * Reading the two sides of one changed file.
 *
 * The panel's diff view needs text, not a patch: the shipped `DiffBlock` computes the
 * diff itself from an old side and a new side. For a staged change those sides are
 * `HEAD:<path>` and the index; for an unstaged one they are the index and the work tree.
 * An untracked file has no old side at all, and a deleted file has no new side — both are
 * reported as empty text rather than as an error.
 *
 * Binary and oversized files are reported as flags. A caller that renders a truncated
 * diff as if it were complete is worse than one that says "binary".
 */
import type { Context } from '@deepseek-ai/cordis'
import { runGit, type GitCommandLimits } from './commands.js'
import type { GitFileDiff } from '../types.js'

/** The filesystem face this module needs, declared structurally. */
interface FsFace {
  resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<unknown>
  readBytes(target: unknown, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
}

/** How the two sides of the file are read. */
export interface DiffReadOptions {
  /** The repository root. */
  root: string
  /** The repository-relative path. */
  path: string
  /** True for the index↔HEAD comparison, false for work-tree↔index. */
  staged: boolean
  /** True when git does not track the path yet, so there is no old side. */
  untracked: boolean
  /** The complete-file cap; a larger side is reported as oversized. */
  maxFileBytes: number
  signal: AbortSignal
}

/** Decode UTF-8 and refuse anything that reads as binary. */
function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** Read one git object as text. */
async function readObject(
  ctx: Context,
  limits: GitCommandLimits,
  options: { root: string; revision: string; signal: AbortSignal },
): Promise<{ text: string | null; missing: boolean; lossy: boolean }> {
  const result = await runGit(ctx, limits, {
    cwd: options.root,
    args: ['show', options.revision],
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    // A path that never existed in that revision reads as empty; anything else is a
    // failure the caller should see through its note.
    return { text: null, missing: true, lossy: false }
  }
  return { text: result.stdout, missing: false, lossy: result.stdoutLossy }
}

/**
 * Read both sides of one changed file.
 *
 * @param ctx - the injected host scope.
 * @param limits - the configured runner limits.
 * @param options - which file, which comparison, and the caps.
 * @returns the two sides plus the flags the panel renders.
 */
export async function readFileDiff(
  ctx: Context,
  limits: GitCommandLimits,
  options: DiffReadOptions,
): Promise<GitFileDiff> {
  const { root, path, staged, untracked, maxFileBytes, signal } = options
  const base: GitFileDiff = {
    path,
    staged,
    oldText: '',
    newText: '',
    binary: false,
    oversized: false,
    note: '',
  }

  // The old side: HEAD for a staged change, the index for an unstaged one.
  let oldText = ''
  if (!untracked) {
    const oldSide = await readObject(ctx, limits, {
      root,
      revision: staged ? `HEAD:${path}` : `:${path}`,
      signal,
    })
    if (oldSide.text !== null && decodeText(new TextEncoder().encode(oldSide.text)) === null) {
      return { ...base, binary: true, note: 'the previous version is not text' }
    }
    if (oldSide.lossy) return { ...base, oversized: true, note: 'the previous version exceeded the output cap' }
    oldText = oldSide.text ?? ''
  }

  // The new side: the index for a staged change, the work tree otherwise.
  let newText = ''
  if (staged) {
    const newSide = await readObject(ctx, limits, { root, revision: `:${path}`, signal })
    if (newSide.lossy) return { ...base, oversized: true, note: 'the staged version exceeded the output cap' }
    newText = newSide.text ?? ''
  } else {
    const fs = (ctx as unknown as { get(name: string): unknown }).get?.('fs') as FsFace | undefined
    if (fs === undefined) {
      return { ...base, oldText, note: 'the filesystem service is unavailable, so the working copy could not be read' }
    }
    try {
      const target = await fs.resolve(path, { cwd: root, signal })
      const bytes = await fs.readBytes(target, signal, maxFileBytes)
      const decoded = decodeText(bytes)
      if (decoded === null) return { ...base, oldText, binary: true, note: 'the working copy is not text' }
      newText = decoded
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // A size refusal is a flag; a missing file means the path was deleted.
      if (/too-large|maxFileBytes|larger than/i.test(message)) {
        return { ...base, oldText, oversized: true, note: 'the working copy exceeds the read cap' }
      }
      if (/not-found|ENOENT|no such file/i.test(message)) {
        return { path, staged, oldText, newText: '', binary: false, oversized: false, note: 'the file is deleted in the working tree' }
      }
      return { ...base, oldText, note: message.slice(0, 200) }
    }
  }

  return { path, staged, oldText, newText, binary: false, oversized: false, note: '' }
}
