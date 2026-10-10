# `git status --porcelain=v2 -z` fixtures

Raw, byte-exact captures of a real `git status` run for the git-explorer status parser, plus a
script that rebuilds every one of them from scratch.

Each scenario ships two (or three) files:

| File | Contents |
| --- | --- |
| `<scenario>.bin` | the exact stdout **bytes** of the status command, NUL terminators and all |
| `<scenario>.json` | `scenario`, `command`, `gitVersion`, `repoFiles` (paths committed in the fixture repo), `notes` |
| `<scenario>.stderr.bin` | only for `not-a-repo`: the exact stderr bytes of the failing run |

## The command

```text
git -c core.quotepath=false status --porcelain=v2 -z --branch --untracked-files=all
```

`repoFiles` lists the paths that were committed in the fixture repository before the scenario's
mutation, in forward-slash form; a file the scenario deletes is still listed, and uncommitted
files that a scenario merely creates are described in `notes` instead.

## Regenerating

```powershell
pwsh -File ./regenerate.ps1                       # fixtures next to this README
pwsh -File ./regenerate.ps1 -ScratchRoot D:\tmp\status-repo
```

The script deletes and rebuilds every scratch repository under
`<repo>/.tools/scratch/status-repo/<scenario>/` (a disposable directory: `ahead-behind` also
uses `ahead-behind-upstream.git` and `ahead-behind-peer/` beside it), re-runs the captured
command in each one, and rewrites the `.bin`/`.json` files. It asserts the shape of every
fixture as it goes, so a git version that changes the porcelain output fails the run instead of
silently rewriting the fixtures.

Determinism comes from the run environment, not from the user's configuration:

* `GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=<scratch>/empty.gitconfig` hide the system and
  global config files, so `core.autocrlf`, `status.renames`, an `init.defaultBranch` and so on
  cannot leak in. The user's global config is never read or written.
* Every mutating command carries `-c core.quotepath=false -c core.autocrlf=false
  -c status.renames=true -c commit.gpgsign=false -c user.name=Fixture
  -c user.email=fixture@example.invalid`.
* Commits are stamped with `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` = `2024-01-01T00:00:00+00:00`
  and repositories are initialised with `git init -b main`, so blob and commit hashes — and
  therefore the `# branch.oid` header — are reproducible. `LC_ALL=C` keeps messages stable.
* Repositories are captured through the child process's stdout *stream* (no shell redirection,
  no text decoding), which is what makes the raw NUL bytes survive.

Because the recorded object ids depend on the git build, `gitVersion` is stored in every
`.json`; the fixtures in this directory were generated with **git version 2.53.0.windows.2**.
Running the script twice in a row produces byte-identical files.

## Scenarios

### `clean`

One commit and nothing changed, so the stream holds only the two branch headers
(`# branch.oid <sha>` and `# branch.head main`) and no file records. It exercises the
empty-status path, where a parser must report a clean tree rather than an error.

### `staged-modified`

A tracked file (`src/app.js`) is edited and staged, so its record is `1 M.` with a head blob
that differs from the index blob. It exercises the staged-only case that the panel lists under
staged changes.

### `unstaged-modified`

The same edit is left unstaged, so the record is `1 .M` with identical head and index blob
hashes. It exercises the worktree-only case that the panel lists under unstaged changes.

### `partially-staged`

A file is staged and then edited again, producing `1 MM` with three different blob hashes
across the head, index and worktree sides. It exercises split staging, where one record has to
appear in both the staged and the unstaged group.

### `untracked`

Two files are created and never added: `new.txt` at the repository root and `dir/new.txt` inside
a brand-new directory. Because `--untracked-files=all` is passed, the nested file is listed
individually as `? dir/new.txt` instead of the directory being collapsed into `dir/`.

### `deleted-staged`

`git rm README.md` removes the file from both the index and the worktree, so the record is
`1 D.` with zeroed index and worktree modes and an all-zero index object id. It exercises a
staged deletion, where the path named by the record no longer exists on disk.

### `deleted-unstaged`

A plain filesystem delete leaves the index untouched, so the record is `1 .D` with head and
index hashes still equal and a zeroed worktree mode. It exercises a deletion that exists only in
the worktree.

### `renamed-staged`

`git mv old.txt new.txt` produces a `2 R.` record whose own token ends with the new path
`new.txt`, while the original path `old.txt` arrives as the next NUL-separated token. It
exercises the rename shape that only `-z` can express unambiguously, including the `R100`
similarity score.

### `added-staged`

A brand-new file is staged, so the record is `1 A.` with a zeroed head mode and an all-zero head
object id. It exercises an addition, where the old-side identity fields are placeholders instead
of hashes.

### `ahead-behind`

The current branch carries one commit its upstream does not have, while the upstream (a bare
clone published by a peer clone) carries one commit the branch does not have, so
`# branch.ab +1 -1` is reported next to `# branch.upstream origin/main`. It exercises divergence
counting, which only exists once a remote-tracking ref is known.

### `detached`

HEAD is detached at the single commit, so `# branch.head (detached)` is reported and neither an
upstream nor ahead/behind headers appear. It exercises the detached state, whose head value is a
sentinel that a parser must not mistake for a branch named `(detached)`.

### `unborn`

A fresh `git init` with one file staged and no commit yet yields `# branch.oid (initial)`
followed by an ordinary `1 A.` record for the staged file. It exercises the unborn branch, where
there is no commit hash to report.

### `conflict`

Two branches edit the same line of `conflict.txt` and the merge is left unresolved, producing a
`u UU N...` record with three distinct stage object ids. It exercises unmerged records, which
carry two more object ids than `1` and `2` records.

### `path-with-spaces`

Three records carry paths containing spaces: a modified `docs/my notes file.txt`, a staged
addition `staged file.txt` and an untracked `loose file.txt`. It exercises path extraction, since
a record's path is the whole remainder of the line and splitting on spaces would truncate or
mis-split all three.

### `not-a-repo`

The directory is not a git repository, so `git status` exits 128, writes zero bytes to stdout and
prints `fatal: not a git repository (or any of the parent directories): .git` on stderr. It
exercises the failure path: `not-a-repo.bin` is intentionally empty and the raw stderr bytes live
in `not-a-repo.stderr.bin`.

## What the raw bytes reveal

* `-z` NUL-terminates **every** record, headers included, and adds no trailing newline — so each
  `.bin` ends with a `0x00` byte and contains no `CR` or `LF` at all.
* A rename's original path is *not* part of the `2` record: the record ends with the new path and
  the original path is the following NUL-separated token (`renamed-staged.bin`:
  `2 R. N... 100644 100644 100644 <hH> <hI> R100 new.txt\0old.txt\0`).
* The stage-2/3 modes of unmerged records appear twice over (`100644 100644 100644 100644`), and
  `1 D.` (staged delete) zeroes both the index and worktree modes while `.D` zeroes only the
  worktree mode.
* The sentinels are literal strings: `# branch.oid (initial)` when there is no commit,
  `# branch.head (detached)` when HEAD is not on a branch.
* Paths are never quoted or escaped in `-z`, so `core.quotepath=false` is belt-and-braces here —
  it matters for the human-readable formats, not for these bytes.
