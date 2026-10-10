/**
 * Change-tree grouping tests: nesting, ordering, and the compacted single-child chain
 * that gives the panel its VS Code-like shape.
 */
import { describe, expect, it } from 'vitest'
import { buildChangeTree, directoryPaths } from '../src/client/change-tree'
import type { GitChange } from '../src/types'

/** One untracked change, as the host reports it. */
function change(path: string): GitChange {
  return { path, status: 'untracked', index: '?', worktree: '?', staged: false }
}

describe('change tree', () => {
  it('nests files under their directories', () => {
    const tree = buildChangeTree([change('src/app.ts'), change('src/lib/util.ts'), change('README.md')])
    expect(tree.map((node) => node.name)).toEqual(['src', 'README.md'])
    const src = tree[0]
    expect(src?.kind).toBe('directory')
    expect(src?.children.map((node) => node.name)).toEqual(['lib', 'app.ts'])
    expect(src?.children[0]?.children.map((node) => node.name)).toEqual(['util.ts'])
  })

  it('lists directories before files, each in natural case-insensitive order', () => {
    const tree = buildChangeTree([
      change('docs/zeta.md'),
      change('docs/Alpha.md'),
      change('docs/beta.md'),
      change('docs/sub/deep.md'),
    ])
    const docs = tree[0]
    expect(docs?.children.map((node) => node.name)).toEqual(['sub', 'Alpha.md', 'beta.md', 'zeta.md'])
  })

  it('compacts a chain of single-child directories into one row', () => {
    const tree = buildChangeTree([change('.tools/notes/scratch/lib/client.js')])
    expect(tree).toHaveLength(1)
    expect(tree[0]?.name).toBe('.tools/notes/scratch/lib')
    expect(tree[0]?.path).toBe('.tools/notes/scratch/lib')
    expect(tree[0]?.children.map((node) => node.name)).toEqual(['client.js'])
  })

  it('stops compacting where a directory gains a second child', () => {
    const tree = buildChangeTree([change('a/b/one.ts'), change('a/b/two.ts'), change('a/c/three.ts')])
    expect(tree.map((node) => node.name)).toEqual(['a'])
    const a = tree[0]
    expect(a?.children.map((node) => node.name)).toEqual(['b', 'c'])
  })

  it('keeps a file row pointing at its own change', () => {
    const entry = change('src/app.ts')
    const tree = buildChangeTree([entry])
    const file = tree[0]?.children[0]
    expect(file?.kind).toBe('file')
    expect(file?.path).toBe('src/app.ts')
    expect(file?.change).toBe(entry)
  })

  it('handles names with spaces and repeated segments', () => {
    const tree = buildChangeTree([change('docs/new file.md'), change('docs/docs/readme.md')])
    const docs = tree[0]
    expect(docs?.children.map((node) => node.name)).toEqual(['docs', 'new file.md'])
  })

  it('returns no rows for an empty group', () => {
    expect(buildChangeTree([])).toEqual([])
  })

  it('lists the visible directory rows for state bookkeeping', () => {
    const tree = buildChangeTree([change('src/lib/deep/file.ts'), change('docs/a.md')])
    // Only rows that exist are listed: the compacted chain above the file is one row,
    // so `src` and `src/lib` are not separate entries.
    expect(directoryPaths(tree)).toEqual(['docs', 'src/lib/deep'])
  })
})
