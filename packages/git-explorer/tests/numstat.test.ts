/**
 * numstat parser tests.
 *
 * The `-z` form is what makes paths with spaces and renames safe; these cases pin the
 * shapes git actually emits.
 */
import { describe, expect, it } from 'vitest'
import { parseNumstat } from '../src/git/numstat'

describe('numstat parser', () => {
  it('reads counts and the path', () => {
    const entries = parseNumstat('3\t1\tsrc/app.ts\0', false)
    expect(entries).toEqual([{ path: 'src/app.ts', staged: false, added: 3, removed: 1, binary: false }])
  })

  it('keeps a path containing spaces whole', () => {
    const entries = parseNumstat('1\t2\tdocs/new file.md\0', true)
    expect(entries[0]?.path).toBe('docs/new file.md')
    expect(entries[0]?.staged).toBe(true)
  })

  it('marks a binary side and reports no counts', () => {
    const entries = parseNumstat('-\t-\tassets/logo.png\0', false)
    expect(entries[0]).toEqual({ path: 'assets/logo.png', staged: false, added: 0, removed: 0, binary: true })
  })

  it('reads several entries and ignores empty tokens', () => {
    const entries = parseNumstat('1\t0\ta.ts\0\0 0\t5\tb.ts\0', false)
    expect(entries.map((entry) => entry.path)).toEqual(['a.ts', 'b.ts'])
  })

  it('returns nothing for an empty stream', () => {
    expect(parseNumstat('', false)).toEqual([])
  })

  it('skips a malformed token instead of inventing an entry', () => {
    expect(parseNumstat('nonsense\0', false)).toEqual([])
  })
})
