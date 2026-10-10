/**
 * Test stand-in for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * At runtime the page's frozen module table provides the real primitives, so this
 * package never resolves them locally; under vitest that resolution fails (`clsx`, a
 * dependency of the shipped bundle, is not linked here). The stub keeps the panel tests
 * about the panel: it renders the same props into data attributes the tests can assert.
 */
import * as React from 'react'

/** A stand-in icon that renders its own name. */
function icon(name: string): (props: { size?: number }) => React.ReactElement {
  return function Icon({ size }: { size?: number }): React.ReactElement {
    return <span data-icon={name} data-size={size ?? 0} />
  }
}

export const IconChevronRightOutlineRegular = icon('chevron-right')
export const IconChevronDownOutlineRegular = icon('chevron-down')
export const IconFolderOpenRegular = icon('folder-open')
export const IconFolderCloseRegular = icon('folder-close')
export const IconPlusOutlineRegular = icon('plus')
export const IconCloseOutlineRegular = icon('close')
export const IconTrashOutlineRegular = icon('trash')

/** A stand-in file glyph carrying the classified kind. */
export function FileTypeIcon({ kind, size }: { kind?: string; size?: number }): React.ReactElement {
  return <span data-icon="file" data-kind={kind ?? ''} data-size={size ?? 0} />
}

/** Classify a file name the way the shipped helper does, coarsely. */
export function classifyFileType(name: string): string {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return extension === '' ? 'text' : extension
}

/** Extension helper the panel does not use yet, kept so the stub matches the surface. */
export function fileExtension(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
}

/** Stand-in for the unified diff renderer: it reports the sides it was handed. */
export function DiffBlock({ diffs }: {
  diffs: { path: string; oldText: string | null; newText: string }[]
}): React.ReactElement {
  return (
    <div data-testid="diff-block">
      {diffs.map((diff) => (
        <div key={diff.path}>
          <span data-testid="diff-path">{diff.path}</span>
          <pre data-testid="diff-old">{diff.oldText ?? ''}</pre>
          <pre data-testid="diff-new">{diff.newText}</pre>
        </div>
      ))}
    </div>
  )
}

/** Count lines the way the shipped helper does, coarsely, for assertions. */
export function diffTotals(diffs: { oldText: string | null; newText: string }[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const diff of diffs) {
    const before = diff.oldText === null || diff.oldText === '' ? [] : diff.oldText.replace(/\n$/, '').split('\n')
    const after = diff.newText === '' ? [] : diff.newText.replace(/\n$/, '').split('\n')
    const shared = new Set(before)
    added += after.filter((line) => !shared.has(line)).length
    const afterSet = new Set(after)
    removed += before.filter((line) => !afterSet.has(line)).length
  }
  return { added, removed }
}
