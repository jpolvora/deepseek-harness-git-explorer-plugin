# Changelog

Versions follow the milestone numbers used in the repository (`0.1.0-m<N>`); the published
release line drops the suffix (`0.1.0`).

## Unreleased

### Distribution
- Publish-ready manifest: repository/homepage/bugs, keywords, `engines`, `publishConfig`,
  a `prepack` build hook and a `probe:compat` script.
- The runtime's Typert protocol and Cordis are declared as **peer dependencies** with a
  range (`>=0.2.0-rc.2 <0.3`, `~4.0.4`), so a consumer's runtime provides them and no
  second protocol identity is installed.
- `docs/INSTALL.md`: the three install routes the app's **Add plugin** dialog accepts
  (package name, local directory, release tarball), the prerequisites, and how to verify
  or remove the plugin.
- `scripts/probe-compat.mjs`: reads the installed desktop archive and asserts every
  contract the plugin depends on — runtime version, frozen client module table,
  `sidebar.right.*` slot keys, plugin artifacts and all nine Remote endpoints.

## 0.1.0-m5

### Agent tools
- `git_status`, `git_diff` and `git_log` registered with the host, backed by two new reads:
  the commit log (a pure parser over a NUL/US-separated `git log --format`) and unified
  patches (`git diff --no-color -U3`).

### Polish
- Localization through the client locale service: `en` and `zh` dictionaries registered as
  `gitExplorer`, named on every slot registration; git's own output stays untranslated.
- The panel and diff view moved from inline styles to CSS Modules compiled into the client
  bundle (lightningcss, one injected style tag per stylesheet), with every rule expressed in
  `--dsw-alias-*` tokens.

## 0.1.0-m4

- Per-file `+N −M` line counts (`git diff --numstat -z` for both comparisons).
- The unsent commit message and the amend flag persist per session.
- **Open file** from a comparison tab, addressing the file through the shipped text preview.

## 0.1.0-m3

- Comparison tabs: clicking a change renders the shipped unified `DiffBlock`, with binary
  and oversized notices instead of a diff that would look complete.

## 0.1.0-m2

- Stage, unstage and discard (destructive verbs require an explicit confirmation) plus a
  commit box with Ctrl+Enter and amend; failures surface git's own first stderr line.

## 0.1.0-m1

- Read-only panel: branch line with upstream drift, staged/changes/untracked/conflicted
  groups, a VS Code-style change tree with persisted collapse state, and diagnostics.

## 0.1.0-m0

- Out-of-tree DSH plugin skeleton: bundle patch, Cordis host service, Typert Remote, and a
  right-sidebar tab with a Start-page card.
