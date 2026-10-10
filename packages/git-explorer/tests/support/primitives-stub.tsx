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
