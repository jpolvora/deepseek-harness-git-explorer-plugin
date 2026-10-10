/**
 * Parser tests over real `git status --porcelain=v2 -z` fixtures.
 *
 * The fixtures are produced by `tests/fixtures/status/regenerate.ps1` from real
 * repositories, so these tests exercise git's actual output rather than a hand-written
 * imitation of it. The final block covers the shapes a fixture cannot force cheaply
 * (a rename's separate original-path token, an unclassifiable record).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePorcelainV2, changeCount } from '../src/git/status'

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'status')
const LIMITS = { maxFiles: 2_000 }

/** Read one fixture's raw bytes and parse them. */
function parseFixture(name: string) {
  const raw = readFileSync(join(FIXTURES, `${name}.bin`), 'utf8')
  return parsePorcelainV2(raw, LIMITS)
}

describe('porcelain v2 fixtures', () => {
  it('clean: one branch header, no entries', () => {
    const status = parseFixture('clean')
    expect(changeCount(status)).toBe(0)
    expect(status.detached).toBe(false)
    expect(status.unborn).toBe(false)
  })

  it('staged-modified: the entry is staged only', () => {
    const status = parseFixture('staged-modified')
    expect(status.commits.staged).toHaveLength(1)
    expect(status.commits.unstaged).toHaveLength(0)
    expect(status.commits.staged[0]?.status).toBe('modified')
    expect(status.commits.staged[0]?.worktree).toBe('.')
  })

  it('unstaged-modified: the entry is unstaged only', () => {
    const status = parseFixture('unstaged-modified')
    expect(status.commits.unstaged).toHaveLength(1)
    expect(status.commits.staged).toHaveLength(0)
  })

  it('partially-staged: one path appears in both groups', () => {
    const status = parseFixture('partially-staged')
    expect(status.commits.staged).toHaveLength(1)
    expect(status.commits.unstaged).toHaveLength(1)
    expect(status.commits.staged[0]?.path).toBe(status.commits.unstaged[0]?.path)
  })

  it('untracked: every new file is listed, including a nested one', () => {
    const status = parseFixture('untracked')
    expect(status.commits.untracked.length).toBeGreaterThanOrEqual(2)
    expect(status.commits.untracked.every((change) => change.status === 'untracked')).toBe(true)
    expect(status.commits.untracked.some((change) => change.path.includes('/'))).toBe(true)
  })

  it('deleted-staged and deleted-unstaged: deletions keep their group and status', () => {
    expect(parseFixture('deleted-staged').commits.staged[0]?.status).toBe('deleted')
    expect(parseFixture('deleted-unstaged').commits.unstaged[0]?.status).toBe('deleted')
  })

  it('renamed-staged: the rename carries its original path', () => {
    const status = parseFixture('renamed-staged')
    const renamed = status.commits.staged[0]
    expect(renamed?.status).toBe('renamed')
    expect(renamed?.origPath).toBeDefined()
    expect(renamed?.origPath).not.toBe(renamed?.path)
  })

  it('added-staged: a new staged file reads as added', () => {
    expect(parseFixture('added-staged').commits.staged[0]?.status).toBe('added')
  })

  it('ahead-behind: the branch header carries upstream and drift', () => {
    const status = parseFixture('ahead-behind')
    expect(status.upstream).not.toBeNull()
    expect(status.ahead).toBeGreaterThan(0)
    expect(status.behind).toBeGreaterThan(0)
  })

  it('detached: no branch name is invented', () => {
    const status = parseFixture('detached')
    expect(status.detached).toBe(true)
    expect(status.branch).toBeNull()
  })

  it('unborn: the initial oid is recognized', () => {
    expect(parseFixture('unborn').unborn).toBe(true)
  })

  it('conflict: unmerged records land in the conflicted group', () => {
    const status = parseFixture('conflict')
    expect(status.commits.conflicted.length).toBeGreaterThanOrEqual(1)
    expect(status.commits.conflicted[0]?.status).toBe('conflicted')
    expect(status.commits.conflicted[0]?.staged).toBe(false)
  })

  it('path-with-spaces: a name with spaces is not split', () => {
    const status = parseFixture('path-with-spaces')
    const all = [
      ...status.commits.staged,
      ...status.commits.unstaged,
      ...status.commits.untracked,
      ...status.commits.conflicted,
    ]
    expect(all.some((change) => change.path.includes(' '))).toBe(true)
  })
})

describe('porcelain v2 edge shapes', () => {
  it('reads a rename record and its following original-path token', () => {
    const raw = [
      '# branch.oid 1111111111111111111111111111111111111111',
      '# branch.head main',
      '2 R. N... 100644 100644 100644 aaaa bbbb R100 new name.txt',
      'old name.txt',
      '',
    ].join('\0')
    const status = parsePorcelainV2(raw, LIMITS)
    expect(status.branch).toBe('main')
    expect(status.commits.staged).toHaveLength(1)
    expect(status.commits.staged[0]?.path).toBe('new name.txt')
    expect(status.commits.staged[0]?.origPath).toBe('old name.txt')
    expect(status.commits.staged[0]?.renameScore).toBe(100)
  })

  it('reports an unclassifiable record instead of dropping it silently', () => {
    const status = parsePorcelainV2('x nonsense\0', LIMITS)
    expect(status.skipped).toHaveLength(1)
  })

  it('cuts at the entry cap and says so', () => {
    const raw = ['? a\0', '? b\0', '? c\0', ''].join('')
    const status = parsePorcelainV2(raw, { maxFiles: 2 })
    expect(status.truncated).toBe(true)
    expect(status.commits.untracked).toHaveLength(2)
  })
})
