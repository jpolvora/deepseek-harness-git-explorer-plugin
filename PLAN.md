# Git Explorer for the DeepSeek Harness Web GUI — Implementation Plan

Target: add first-class **Git** capability to the DSH UI — a Git (Source Control) panel in the right
sidebar with a **Git** card on the Start page, file staging, commit, diffs, history and branches —
shipped as an out-of-tree plugin in this repository.

Author: agent session `session-c4e62bae`. Date: 2026-10-10.
Status: **plan for approval** — no implementation code has been written yet.

---

## 0. The fact that shapes this whole plan

The running desktop app is **DSH `0.2.0-rc.2`**, but the local checkout at `L:\source\deepseek-harness`
is **`0.1.0-rc.5`** and does **not** contain the GUI in the screenshot at all (repo-wide grep for
`sidebar.right`, `Workspace files`, `New terminal` → 0 hits in `L:\source\deepseek-harness`).

| Fact | Value | Source |
|---|---|---|
| Installed app | `@deepseek-ai/dsh-desktop` `0.2.0-rc.2` | `resources/app.asar` → `/package.json` |
| Installed runtime | `@deepseek-ai/dsh-desktop-runtime` `0.2.0-rc.2`, host protocol v4, Node 24.18.1, pnpm 11.7.0 | `/dsh/desktop-runtime.json` |
| Bundle runtime | `@deepseek-ai/cordis` `4.0.4` (peer range `~4.0.4`) | `/dsh/desktop-runtime.json`, package peer deps |
| Profile | `desktop` → `C:\Users\jpolv\.dsh\profiles\desktop` (live profile: plugin changes apply at runtime) | `$env:DSH_PROFILE_DIR` |
| Profile bundles | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` | profile `package.json` |
| Installed packages on npm | yes — all needed `@deepseek-ai/dsh-*@0.2.0-rc.2` are public with `.d.ts` | `npm view …` |

**Consequence:** the plan targets the **0.2.0-rc.2 API surface**, and the implementation workspace keeps a
readable extraction of that runtime at `.tools/runtime-0.2.0-rc.2/` (built `lib/*.js` + the contract
`README.md` of every relevant package). The local rc.5 checkout is used only for *conventions*
(`docs/web-styling.md`, `tsdown.client.ts` preset ideas, `.agents/skills/*`).

---

## 1. Scope

### 1.1 In scope (v1)
- A **Git tab type** in the right sidebar, reached from a **Git card on the Start page** (the guide tab).
- Working-tree state: branch/upstream/ahead-behind, staged / unstaged / untracked / conflicted groups.
- Row actions: stage, unstage, discard (destructive → confirm), stage all / unstage all.
- Commit box: message + commit (+ amend), with validation and error surfacing.
- Diff viewing on row click: unified diff in its own tab, using the shipped `DiffBlock` primitive.
- Open the changed file in the existing text preview at a line.
- Branch indicator in the tab chip; branch list + checkout/create branch.
- Commit history list (paged) for the current branch.
- Agent tools over the same service: `git_status`, `git_diff`, `git_log` (read-only in v1).

### 1.2 Out of scope for v1 (documented as later milestones)
- push / pull / fetch (needs credential + interactive flows → M6, via `spawnTerminal` handoff).
- Merge/rebase/cherry-pick/stash/tag UIs, blame, file history, submodule management.
- Side-by-side diff (no such primitive exists — see §5.4; M6 option).
- Multi-repository / multi-root workspaces (v1 = the session's working directory).
- Hosting a Git panel outside the right sidebar (e.g. a main-column panel).

### 1.3 Non-goals
- Changing or forking shipped DSH packages. The plugin must be additive and removable.
- A general-purpose git client (no `git config` editing, no hooks management, no credential storage).

---

## 2. Verified platform surface (what we build on)

Everything below was read from the shipped 0.2.0-rc.2 artifacts (`R/` = `.tools/runtime-0.2.0-rc.2/`)
and cross-checked against the live slot tree.

| Capability | Contract | Where |
|---|---|---|
| Tab type registry | `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide?, keepMounted?, multiple? })` → disposer; `id` unique, a `kind` holds ≤1 `builtin` + ≤1 `extension`; bands `extension` > `builtin` > `fallback` (an outside-the-product type is `extension`) | `R/dsh-client-ui-sidebar-right/README.md` |
| Tab body seat | `sidebar.right.pane.tab` — keyed, session scope, key = definition `id`; body reads `{ sidebar, panel, tab }` via `useTabInfo()` | same; live slot tree confirms |
| Tab chip seat | `sidebar.right.pane.tab.title` — keyed by the same id; absent → the `title(address)` text captured at open time | same |
| Per-tab menu | `sidebar.right.tab.menu.item` (list, session) — owner props `{ tab, dismiss }`. **There is no pane/tab toolbar seat** | same |
| Start page | the guide tab; its page title is literally `"Start"` (`tab.guide.title`). Guide entries are declared **inside the tab-type registration**: `guide: [{ id, order, title, description, icon, commandId? }]`; shipped orders 10 (Workspace files) / 20 (New terminal) / 30 (Browser); ≤4 entries keep their descriptions | `R/dsh-client-ui-sidebar-right/lib/client.js`, `R/dsh-client-ui-sidebar-files/lib/client.js` |
| Custom guide card | `sidebar.right.tab.guide.entry` — keyed by the *contributing definition id*; props `{ entryId, kind, title, description? }` + `useTabInfo` | same |
| Navigation | `ctx.sidebarRight.openTab(kind, options?)`, `openResource(address, options?)`, `close/focus/split/float/dock/tabsIn/active/isExpanded/toggleExpanded`, `registerCloseHandler(kind, handler)`, `openTabs` (restore inventory), `mounted` | `R/dsh-client-ui-sidebar-right/README.md` |
| Tab actions | `tab.actions = { bindCommands, openResource, openTab, close }`; `tab.navigation.params`, `tab.signal`, `tab.id`, `tab.visible` | same |
| Layout persistence | the sidebar stores layout under `dsh.sidebar-right.v1.<sessionId>` in localStorage; **providers own their own content restore** | same |
| Open a file | `fileAddressFor(sessionId, cwd, path)` → `dsh-resource://file/session/<sessionId>/<rel path>`; `openResource(addr, { params: { line } })` (text preview merges `{ line?: number }`) | `R/dsh-client-ui-sidebar-files/README.md`, `R/dsh-client-ui-sidebar-documentpreview/README.md` |
| UI kit | `@deepseek-ai/dsh-client-ui-primitives`: `Button, Input, Checkbox, Switch, SegmentedControl(s), Pill, Tag, StateDot, PathLabel, DisclosureRow, Menu/MenuItemButton/MenuSurface, Modal + RiskConfirmation, Tooltip, HoverCard, Toast (owner-rendered), CodeBlock, **DiffBlock**, FileTypeIcon/classifyFileType, IconBranchOutlineRegular, IconTrashOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer, writeClipboard` | `R/dsh-client-ui-primitives/lib/index.js` |
| Diff primitive | **`DiffBlock` exists** (unified, jsdiff `structuredPatch`, 3 context lines, `⋯` gaps, `maxLines=16` fold, copy/wrap toolbar) + `diffTotals(diffs)`; props `{ diffs: { path, oldText?, newText }[], labels, maxLines?, className? }`. **No side-by-side diff exists anywhere** | same |
| Absent primitives | split-pane, virtualized list, textarea, tree, context-menu service, confirm-dialog service, global toast service | same |
| Slot system | `ctx.slots.register({ name, key, locale, store, inject, children }, Component)` inside `ctx.effect(() => ctx.slots.inject(name, () => …))`; kinds `single/list/keyed/chain`; declaring a slot claims it; disposers collapse children | `R/dsh-client-ui-slots/README.md`, `R/dsh-client-ui-sidebar-files/lib/client.js` |
| Subprocess | `ctx.subprocess.spawn({ argv, cwd, stdio, graceMs, signal, env })` (argv never shell-interpreted), `handle.collected.stdout.readFrom(0)`, `await handle.done`; `spawnTerminal` for interactive | `R/dsh-subprocess/README.md`, `R/dsh-workspace-changes/lib/types/git.js` |
| Proven git invocation | env `GIT_CONFIG_COUNT=0`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, bounded stdout/stderr, `graceMs: 2000`, timeout via `AbortSignal.any([signal, AbortSignal.timeout(ms)])`; `rev-parse` exit 128 + `/not a git repository/i` → "not a repo" | `R/dsh-workspace-changes/lib/types/git.js` |
| Existing git support | **only** `dsh-workspace-changes` (per-turn snapshots; service `ctx.workspaceChanges.summary/diff`; **host-only, not a Remote**; no staging/commit/branch/log). Live service catalog: 0 git services, 0 git tools | `R/dsh-workspace-changes/README.md` |
| Session cwd | `sessions.get(id).header.cwd`, fallback `ctx.sandboxPolicy.workspaceRoot` | `R/dsh-api-workspace-files/lib/types/index.js` |
| Remote (host→client) | `class X extends TypertRemoteService`, `super(ctx, 'git')`, `@Remote` methods with the **scope parameter first and `signal` last**; `@Remote({ mode: 'stream' })` returns an async iterable; failures are `RemoteError('<domain>/<reason>', msg, details)`; artifacts `lib/typert.host.js` (`exports["./typert"]`) + `lib/typert.remote-client.js` (`exports["./remote"]`) | `R/dsh-typert-protocol/README.md`, `R/dsh-api-workspace-files/package.json` |
| Typert generation | published generator with a tsdown plugin: `import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'` → `typertPlugin({ mode: 'workspace', faces: ['host'] })` | npm + `L:\source\deepseek-harness\tsdown.config.ts` |
| Client half loading | package declares `"dsh": { "client": { "inject": [<pkg names>], "platform": "web" } }`, exports `"./client" → lib/client.js`; the host serves it under `/plugins`; the browser evaluates a **CJS closure factory**: `window.__ModuleLoader__.load({ id: "<exact package name>", factory: (require) => { … exports.apply = apply; exports.inject = inject; return module.exports } })`. Built artifact must exist before launch; HMR swaps a row by revision (`clientModules.rebuilt(id)`) | `R/dsh-client-modules/README.md`, `R/dsh-client-ui-sidebar-files/lib/client.js` |
| Config | `import z from '@deepseek-ai/schemastery'`; `static Config = z.object({ … })`; read as `constructor(ctx, config)` | `R/dsh-workspace-changes/lib/index.js` |
| Tools | `ctx.tools.register(defineTool({ name, description, parameters, output, execute }))` from `@deepseek-ai/dsh-tools`; parameters are a JSON-Schema-shaped property map; `output.render(args, value)` shapes the card | `R/dsh-plugin-manager/lib/types/tools.js` |
| Approval / sandbox | `ctx.approval.request`, `tools/pre-execute` decision `{kind:'allow'\|'deny'\|'ask'}`, `ctx.sandboxPolicy.resolve({session})`, `ctx.sandbox.confine(argv, policy, signal)`. **`ctx.subprocess` neither confines nor asks approval — the plugin must do both itself** | live host catalog, `R/dsh-plugin-manager/lib/types/tools.js` |
| Bundle | `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; patch `- insert: [{ id, name }]`; **the row `name` must be the package root, never a subpath**; the manager appends the package to `dsh.profile.bundles` on install | `R/dsh-experimental-schedule-bundle/package.json` + `cordis.patch.yml` |
| Install | `plugin_manager.install_bundle` accepts **absolute local paths**, registry specs, git URLs, tarballs; a compatibility gate reads the local `package.json` **before** pnpm runs; build scripts need explicit approval; desktop profiles route package operations through the Desktop shell | `R/dsh-plugin-manager/README.md`, `R/dsh-plugin-manager/lib/types/install-spec.js` |
| Logs | `<profile>/.plugin-manager/logs`; install output streams over `plugin-manager/install-log` | `R/dsh-plugin-manager/README.md` |
| Styling | CSS Modules + `clsx`, `--dsw-alias-*` semantic tokens only, no literal colors, no theme branches, keep diff/source lines unwrapped; plugin CSS is inlined by the client build | `L:\source\deepseek-harness\docs\web-styling.md`, shipped bundles |

**What does not exist and must be built:** the whole git domain (status model, staging, commit, branch,
log), a client-callable git Remote, diff data for arbitrary working-tree files, `.git` change watching,
staged/unstaged grouping UI, a side-by-side diff, context menus, and virtualized/large-list handling.

---

## 3. Architecture

### 3.1 Repository layout

```
L:\source\deepseek-harness-git-explorer-plugin\
├─ PLAN.md                        ← this file
├─ package.json                   private root: scripts (build/watch/test/install:profile)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json / tsconfig.host.json / tsconfig.client.json
├─ tsdown.config.ts               host face (typertPlugin) + client face (closure-factory bundle)
├─ vitest.config.ts
├─ .tools/                        runtime extraction + asar readers (research only; gitignored)
├─ packages/git-explorer/
│  ├─ package.json                @jpolv/dsh-git-explorer  (bundle + host + client in ONE package)
│  ├─ cordis.patch.yml            - insert: [{ id: git-explorer, name: '@jpolv/dsh-git-explorer' }]
│  ├─ icon.svg  locale/en.json  locale/zh.json
│  └─ src/
│     ├─ index.ts                 host plugin: inject + Config + service + tools
│     ├─ git/commands.ts          spawn wrapper: env scrub, timeout, caps, exit-code mapping
│     ├─ git/repo.ts              repo discovery & per-session cache (rev-parse)
│     ├─ git/status.ts            `status --porcelain=v2 -z --branch` parser → GitStatus
│     ├─ git/diff.ts              `diff --numstat`/`diff -U3`, untracked & binary & oversized handling
│     ├─ git/mutations.ts         add / restore --staged / restore / commit / checkout / branch
│     ├─ git/errors.ts            RemoteError codes
│     ├─ service.ts               GitService extends TypertRemoteService (@Remote methods)
│     ├─ tools.ts                 defineTool registrations + approval/escalation wiring
│     └─ client/
│        ├─ index.ts              client plugin: inject, tab type, slots, shortcuts, guide card
│        ├─ definition.ts         the tab-type declaration (kind `git`, kind `git-diff`, guide entries)
│        ├─ store.ts              defineStore: per-tab state (groups, expanded, selection, draft message)
│        ├─ face.ts               ctx.remote.git calls, refresh policy, abort handling
│        ├─ GitBody.tsx           panel: header, commit box, groups, rows
│        ├─ GitTitle.tsx          chip: branch + change count
│        ├─ GuideCard.tsx         Start-page card (branch + dirty count)
│        ├─ ChangeRow.tsx         one file row + hover actions
│        ├─ CommitBox.tsx         message input + commit/amend
│        ├─ DiffBody.tsx          diff tab body built on DiffBlock
│        ├─ BranchMenu.tsx        branch list / checkout / create
│        └─ locales.ts            `gitExplorer` namespace (en, zh)
└─ tests/                         host parser + service tests, client render tests, e2e script
```

**Why one package:** the bundle patch, the host half and the client half can live in one package
(`dsh.bundle.patch` + `exports["."]` + `dsh.client` + `exports["./client"]`); the host's client-module
system keys every browser row by the loader entry name, which must resolve to a package root — a subpath
row silently produces no browser row. Split only the Remote contract into its own package later, if it
ever needs an independent version.

### 3.2 Host half

```ts
// src/index.ts (sketch)
export const name = 'git-explorer'
export const inject = ['subprocess', 'sessions', 'tools', 'sandboxPolicy', 'approval']
export const Config = z.object({
  gitPath: z.string().default('git'),
  timeoutMs: z.number().default(30_000),
  outputMaxBytes: z.number().default(8 * 1024 * 1024),
  maxFiles: z.number().default(2_000),
  maxDiffBytes: z.number().default(2 * 1024 * 1024),
  refreshOnFocus: z.boolean().default(true),
})
export function apply(ctx: Context, config: Config) {
  const service = new GitService(ctx, config)   // extends TypertRemoteService, super(ctx, 'git')
  // `super(ctx, 'git')` performs the wire binding and the service registration; the exact Cordis
  // registration call for a further host-side alias is confirmed in M0 (see dsh-api-workspace-files).
  ctx.tools.register(...)                       // git_status / git_diff / git_log  (read-only in v1)
}
```

Service methods (wire shape: **session scope first, `signal` last**):

| Method | Git invocation | Notes |
|---|---|---|
| `status(sessionId, opts, signal)` | `status --porcelain=v2 -z --branch --untracked-files=all` | one call gives branch, upstream, ahead/behind, XY status per path, renames with scores |
| `diff(sessionId, path, { staged }, signal)` | `diff --no-color --no-ext-diff -U3 [--cached] -- <path>`; untracked → `old=""`, `new=<file text>` | returns hunks for `DiffBlock` + `{ binary, oversized, truncated }` |
| `stage(sessionId, paths[], signal)` | `add -- <paths…>` | `--` always; never `add -A` |
| `unstage(sessionId, paths[], signal)` | `restore --staged -- <paths…>` (fallback `reset -q HEAD --` on git < 2.23) | |
| `discard(sessionId, paths[], signal)` | `restore -- <paths…>` / `clean -f -- <paths…>` for untracked | destructive → UI confirm + approval |
| `commit(sessionId, { message, amend, signOff }, signal)` | `commit -F -` with the message on stdin (`stdio.stdin = { data }`), `--amend`, `--signoff` | avoids argv length limits and quoting |
| `branches(sessionId, signal)` | `for-each-ref --format=… refs/heads refs/remotes` | |
| `checkout(sessionId, { branch, create }, signal)` | `switch [-c] <branch>` (fallback `checkout [-b]`) | |
| `log(sessionId, { limit, skip, path }, signal)` | `log --max-count --skip --format=<NUL-safe>` | paged |
| `watch(sessionId, signal)` *(M6)* | stream: `fs.watch` on `<gitdir>/HEAD`, `<gitdir>/index` + debounce | v1 refreshes on focus/mutation instead |

Shared command runner (copied shape from `dsh-workspace-changes/lib/types/git.js`):

```ts
const signal = AbortSignal.any([opts.signal, AbortSignal.timeout(config.timeoutMs)])
const handle = ctx.subprocess.spawn({
  argv: [exe, ...args], cwd,
  stdio: { stdin: data ? { data } : 'ignore',
           stdout: { maxBytes: config.outputMaxBytes },
           stderr: { maxBytes: 16 * 1024 } },
  graceMs: 2000, signal,
  env: { GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
})
const { exitCode } = await handle.done
const out = handle.collected.stdout.readFrom(0)
```

* **Repo discovery** is `rev-parse --show-toplevel --absolute-git-dir`, cached per session and invalidated
  when `session.header.cwd` changes; exit 128 + `/not a git repository/i` → `{ isRepo: false }`.
* **Confinement and approval** for mutating verbs: `sandboxPolicy.resolve({ session })` →
  `ctx.sandbox.confine(argv, policy, signal)` when the mode is not `danger-full-access`, and an approval
  request for `discard` (and for `commit` under a restrictive policy). Read-only verbs run confined where
  possible and never prompt.
* **Errors** are `RemoteError('git/<reason>', message, details)` — codes: `git/not-a-repository`,
  `git/not-installed`, `git/timeout`, `git/output-too-large`, `git/command-failed` (with `exitCode`,
  `stderr`, `argv`), `git/binary-file`, `git/oversized`, `git/conflict`, `git/nothing-to-commit`,
  `git/identity-missing` (no `user.name`/`user.email` → a distinct, actionable failure). Callers branch
  on the code, never on message text.

### 3.3 Client half

```ts
// src/client/index.ts (sketch)
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'shortcuts', 'remote', 'remote.git']
export function apply(ctx: Context) {
  const store = defineStore({ … })                       // per-tab state, bucketed by tab id
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID, kind: 'git', priority: 'extension', keepMounted: true,
    title: () => t('type.label'),
    guide: [{ id: 'source-control', order: 5, title: () => t('guide.title'),
              description: () => t('guide.description'), icon: GitGlyph, commandId: 'git.focus' }],
  }), 'git-explorer: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: ID, locale: NS, store, inject: face, children: {},
  }, GitBody)), 'git-explorer: body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID }, GitTitle)), '…: title')
  ctx.shortcuts.register({ id: 'git.focus', defaults: ['Mod+Shift+G'], … })
  // second tab type: kind 'git-diff', multiple: true, opened with params { path, staged }
}
```

* **Data flow:** `ctx.remote.git.status(sessionId, opts, signal)`; refresh after every mutation, on tab
  focus (`tab.visible`), and on window focus; a manual refresh button in the panel header. M6 adds the
  `watch` stream for push updates.
* **Diff tabs:** kind `git-diff`, `multiple: true`, opened with `tab.actions.openTab('git-diff', { params:
  { path, staged, mode: 'unified' } })`; the body fetches hunks from `remote.git.diff` and renders
  `DiffBlock`. Opening the *file itself* at a line reuses the shipped file address:
  `openResource(fileAddressFor(sessionId, cwd, path), { params: { line } })`.
* **Start-page card:** rely on the standard card (it renders the shortcut hint from `commandId`) unless we
  need branch/dirty-count content — then register `sidebar.right.tab.guide.entry` keyed by `ID` and render
  the hint ourselves (as the terminal panel does).
* **Chip:** the title seat renders the live branch name + `(N)` change count; the open-time `title()` is
  the fallback.
* **Empty states:** no session/cwd, not a repository, git missing, clean tree, huge repo (status timed
  out), detached HEAD, mid-merge/rebase (`status` reports conflicts → a banner with the operation name).
* **Accessibility/keyboard:** rows are buttons inside a `listbox`-like list with arrow-key navigation of
  our own (no primitive exists), `Enter` opens the diff, `Space` toggles stage, `Mod+Enter` commits.

### 3.4 Bundle, build, install

`packages/git-explorer/package.json` (essentials):

```jsonc
{
  "name": "@jpolv/dsh-git-explorer",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":            { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client":     { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./typert":     { "types": "./lib/types/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote":     { "types": "./lib/types/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib/**/*.js", "lib/types/**/*.d.ts", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": {
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-sidebar-right", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-shortcuts", "@deepseek-ai/dsh-client-locale"] },
    "bundle": { "patch": "./cordis.patch.yml" }
  },
  "peerDependencies": { "@deepseek-ai/cordis": "~4.0.4" },
  "dependencies": { "@deepseek-ai/schemastery": "~3.18.4", "zod": "^4.4.3", "diff": "^9.0.0" },
  "devDependencies": { "@deepseek-ai/dsh-subprocess": "0.2.0-rc.2", "…": "0.2.0-rc.2", "tsdown": "…", "typescript": "…" }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: git-explorer
      name: '@jpolv/dsh-git-explorer'
```

Client bundle shape — the built `lib/client.js` must be the closure factory the loader expects:

```js
window.__ModuleLoader__.load({
  id: "@jpolv/dsh-git-explorer",
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    /* … bundle body, externals via require("react") … */
    exports.apply = apply; exports.inject = inject; return module.exports;
  }
});
```

Build config: the host face runs tsdown with `typertPlugin({ mode: 'workspace', faces: ['host'] })` to emit
`lib/typert.host.js` + `lib/typert.remote-client.js` from the `@Remote` methods; the client face emits the
wrapper above with `react`, `react-dom`, `@deepseek-ai/cordis` and the DSH client packages marked
external, and CSS Modules compiled inline (lightningcss, as the shipped preset does).

Install into the `desktop` profile (any of these, in order of preference):

1. **Plugins page** in the GUI (Settings → Plugins) — install by absolute path
   `L:\source\deepseek-harness-git-explorer-plugin\packages\git-explorer`.
2. **CLI**: `dsh plugin --profile desktop …` (exact install subcommand to be confirmed in M0; the CLI
   definitely exposes `version-exemptions` / `allow-version` / `revoke-version`).
3. **Manual fallback** (no manager involvement): `pnpm add <abs path>` inside
   `C:\Users\jpolv\.dsh\profiles\desktop`, append `- insert: [{ id: git-explorer, name: '@jpolv/dsh-git-explorer' }]`
   to the profile's `cordis.patch.yml`, restart the app.

---

## 4. Data contracts

```ts
type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'typechange'
                   | 'untracked' | 'ignored' | 'conflicted'

interface GitChange {
  path: string            // workspace-relative, forward slashes (git's own form)
  displayPath: string     // original path for renames ("old → new")
  status: GitFileStatus
  staged: boolean
  indexStatus?: string    // raw XY letter from porcelain v2
  worktreeStatus?: string
  renameScore?: number
  binary?: boolean
  additions?: number      // from a follow-up --numstat call (lazy, paged)
  deletions?: number
}

interface GitStatus {
  isRepo: boolean
  repoRoot?: string; gitDir?: string
  branch?: string; detached?: boolean; unborn?: boolean
  upstream?: string; ahead?: number; behind?: number
  operation?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect'   // from gitDir markers
  staged: GitChange[]; unstaged: GitChange[]; untracked: GitChange[]; conflicted: GitChange[]
  truncated?: boolean     // more than config.maxFiles
}

interface GitHunk { header: string; lines: { kind: ' ' | '+' | '-'; text: string }[] }
interface GitFileDiff {
  path: string; staged: boolean
  oldText?: string; newText?: string      // what DiffBlock consumes
  hunks: GitHunk[]                        // for future renderers
  binary?: boolean; oversized?: boolean; truncated?: boolean
}
```

Parsing notes: `--porcelain=v2 -z` is NUL-separated and **never quoted**, which makes it safe for spaces,
newlines-in-names (rare) and Windows paths; `# branch.ab +N -M` carries ahead/behind; rename records carry
the original path in a following NUL token; conflicts appear as `u` records. The parser is a pure function
→ unit-testable without git.

---

## 5. UI specification

### 5.1 Start page (the "Git" card)
A 4th guide capsule, `order: 5` (first) or `40` (last) — recommendation: **5**, so Git reads as the first
tool. Title **“Git”**, one-line description, branch glyph. With exactly four entries descriptions remain
visible (a fifth entry would drop them all), so keep the description short.

### 5.2 Panel (tab body)
```
┌ branch ▾  main ↑2 ↓0            ⟳   ⋯ ┐   header row (PathLabel of repo root on a second line)
│ ┌───────────────────────────────────┐ │
│ │ Commit message…                   │ │   Input (single line) + Commit button
│ └───────────────────────────────────┘ │
│ ▾ Staged Changes (2)         [unstage all]
│    M  src/app.ts                       │   row: status letter + FileTypeIcon + PathLabel
│ ▾ Changes (5)              [stage all] │          hover: stage / discard
│    M  src/other.ts                     │
│ ▾ Untracked (1)                        │
│    U  notes.md                         │
└────────────────────────────────────────┘
```
* Header: branch menu (`Menu` + `useAnchoredPosition`), ahead/behind counters, refresh button, overflow
  (`Menu`) with "Stage all", "Discard all", "Copy repo path", "Open in terminal" (M6).
* Rows: click → diff tab; hover actions → stage/unstage/discard; `Tag`/`StateDot` for status coloring via
  tokens; conflict rows get a warning tone and offer "open file" (resolution is manual in v1).
* Commit box: disabled until a staged change and a non-empty message; `Mod+Enter` commits; amend toggle;
  on `git/identity-missing` show the exact `git config` command to run.
* Errors surface inline in the panel (no global toast service exists) with a retry affordance.

### 5.3 Diff tab
Unified diff: file header (path, staged/unstaged badge, `+N −M` from `diffTotals`), then `DiffBlock` with
`labels: ['Original', 'Working tree']` (or `['Index', 'Working tree']` for unstaged) and `maxLines` folding.
Toolbar in the body: unified/staged toggle, "Open file", copy path, reload. Binary and oversized files show
a plain explanation instead of a body (never a truncated lie).

### 5.4 The side-by-side question
No side-by-side diff primitive exists anywhere in the runtime (`IconCompareSplitOutlineRegular` is exported
with zero usages). Options, cheapest first:
1. **Reuse `DiffBlock`** (recommended for v1) — unified, consistent with the rest of DSH.
2. Compose two `CodeBlock`s in a CSS grid with synchronized-scroll JS (M6; ~1–2 days, no primitive help).
3. Use dockkit's pane split: open the file preview in one pane and a unified diff in the other (M6; free
   layout, but the panes are independent tabs, not a true diff editor).

---

## 6. Build, install and dev loop

| Step | Command / action |
|---|---|
| Install deps | `pnpm install` at the repo root (Node 24+, pnpm 11) |
| Build both faces | `pnpm build` → host ESM + typert artifacts + `lib/client.js` |
| Watch client | `pnpm watch:client` (tsdown `--watch`) — a rewritten `lib/client.js` changes the row revision and the open page picks it up through HMR |
| Host change | rebuild + **restart the app** ("package replacements require restarting the process to load a fresh JavaScript module generation") |
| Install/reinstall | Plugins page (abs path) or `dsh plugin --profile desktop …`; install output/logs at `C:\Users\jpolv\.dsh\profiles\desktop\.plugin-manager\logs` |
| Verify load | Start page shows the Git card; the tab opens; the browser console shows the row registered under `@jpolv/dsh-git-explorer` |
| Version bumps | bump the exact `0.2.0-rc.2` dev pins together with the app; the compatibility gate rejects mismatched peers (exemption via `plugin_manager` `set_version_exemption` / `dsh plugin allow-version` only after an explicit risk warning) |

Note: `pnpm run dev:web` in the rc.5 checkout globs only `packages/*/*` and therefore does **not** watch
this repository — our own `tsdown --watch` is the loop.

---

## 7. Milestones

| # | Deliverable | Exit criteria | Est. |
|---|---|---|---|
| **M0** | **De-risking spikes** (see §9.1) | (a) a minimal client plugin renders a **Git card + tab body** in the running GUI and hot-reloads; (b) the client half successfully calls a `@Remote` method through generated Typert artifacts, **or** the documented fallback is proven | 1 d |
| **M1** | Read-only panel | Git card on the Start page; panel lists branch, ahead/behind, staged/unstaged/untracked/conflicted, matching `git status` on this repo and a scratch repo; refresh + error/empty states | 2–3 d |
| **M2** | Staging + commit | stage/unstage/discard (with confirm), stage all/unstage all, commit + amend, `git/identity-missing` guidance; every mutation refreshes the panel | 2–3 d |
| **M3** | Diffs | row click opens a diff tab (`DiffBlock`); staged vs unstaged; binary/oversized handling; "open file at line" | 2 d |
| **M4** | History + branches | paged commit log for the current branch; branch menu with checkout/create + error handling for a dirty tree | 2 d |
| **M5** | Agent tools + polish | `git_status` / `git_diff` / `git_log` tools with card rendering; shortcut + guide hint; locale (en/zh); README; test suite green | 2 d |
| **M6** | Optional | push/pull/fetch via `spawnTerminal` handoff; `watch` stream push updates; side-by-side diff; multi-root; stash | 3–5 d |

Total to a complete local v1 (M0–M5): **~11–13 working days**.

---

## 8. Test and verification strategy

* **Pure unit tests** — porcelain-v2 parser (renames, conflicts, unborn branch, ahead/behind, spaces in
  names, detached HEAD), diff-hunk parser, status-letter → `GitFileStatus` mapping, path normalization.
* **Host integration tests** — vitest with a temp repo fixture: `git init`, commits, edits, renames,
  conflicts, deletion; assert every service method against real `git` output; assert caps (huge file,
  binary, timeout) and every `RemoteError` code.
* **Client tests** — `@deepseek-ai/dsh-client-test-runtime@0.2.0-rc.2` + `@testing-library/react` with a
  fake `remote.git`: rendering, grouping, hover actions, disabled commit states, error states.
* **Manual GUI checklist** (run after each milestone, on Windows):
  1. card appears, opens the panel, chip shows the branch;
  2. status matches `git status --short` in a repo with staged + unstaged + untracked + a rename;
  3. stage/unstage/discard/commit each reflect immediately and survive a tab switch;
  4. diff opens for text, binary, and a >2 MiB file;
  5. non-repo folder, missing `git`, and a mid-merge repo show their own states;
  6. panel restore after reload (tab returns, content reloads);
  7. two sessions with different workspaces keep independent state; disable the plugin in the Plugins page
     and confirm the card and tab disappear cleanly (no orphan slot errors).
* **Regression guard** — nothing shipped may change: the plugin only *adds* a tab type (`priority:
  'extension'`), a guide entry, its own slots, its own shortcut ids and its own Remote namespace.

---

## 9. Risks, unknowns and spikes

### 9.1 The two spikes that must pass first (M0)
1. **Out-of-tree client bundle + HMR.** Emitting the `window.__ModuleLoader__.load` closure factory with
   correct externals is not formally documented for third parties; the reference is the rc.5
   `packages/client/tsdown.client.ts` preset, which is repo-local. *Mitigation:* copy the wrapper
   (banner/footer + externals list + inline CSS Modules) into our tsdown config, prove it with a static
   panel, then prove HMR by editing the body.
2. **Typert generation out-of-tree.** The generator is published
   (`@deepseek-ai/dsh-typert-generator@0.2.0-rc.2`, entry `./tsdown` → `typertPlugin`), but no third-party
   example exists. *Mitigation:* run the plugin against our own `tsconfig.host.json` seed and load the
   result; if it cannot be made to work, fall back to a host-registered HTTP route
   (`ctx.webServer.register(route)`) plus `fetch` in the client half — this is a documented escape hatch,
   but it must respect the Connection/token trust model, and it loses typed streaming.

### 9.2 Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Pre-release API drift (`0.2.0-rc.2` → `0.2.1-alpha.2` already exists on npm) | plugin breaks on app update | pin exact versions, keep `peerDependencies` narrow, keep the extraction + a smoke script; re-verify each upgrade |
| Compatibility gate rejects the install (`incompatible-version`) | cannot install | read the refusal's `peers`, fix ranges, or grant an exemption explicitly (with the risk warning) |
| No automatic approval/confinement for our own git commands | destructive surprises | confine when the mode requires it; request approval for `discard`/`commit`; never run `reset --hard`, `clean -fd`, `push -f`; always use explicit pathspecs and `--` |
| Large repos: `git status` slow / huge output | frozen panel | timeouts, `maxFiles`, `maxDiffBytes`, `truncated` flags, lazy `--numstat` |
| `.git` change watching is unsanctioned | stale panel | v1 = refresh on focus/mutation; M6 = debounced `fs.watch` on `HEAD`/`index` |
| Windows specifics (CRLF, long paths, junctions) | wrong diffs | `LC_ALL=C`, `-z` output, `core.autocrlf` respected as-is, test on this machine |
| No pane toolbar / context-menu / virtualized list primitives | more UI code | own header row inside the body (as the Files panel does); `Menu` + `useAnchoredPosition`; row windows for huge change lists |
| Desktop shell owns package operations | tool-based install may be refused | use the Plugins page or CLI; manual profile edit as the last resort |
| i18n: the UI is locale-driven | untranslated panel | ship `gitExplorer` namespace in en + zh; bundle `locale/*.json` for the plugin page |

---

## 10. Open decisions for you

1. **Card label** — "Git" (your annotation) vs "Source Control" (VS Code's wording). Recommendation: **Git**.
2. **Card position** — first (`order: 5`) or after Browser (`order: 40`). Recommendation: **first**.
3. **v1 depth** — stop at read-only status (M1) or go through staging/commit/diffs (M2–M3).
   Recommendation: **through M3**; that is what makes it feel like VS Code's Source Control.
4. **Diff rendering** — reuse the shipped unified `DiffBlock` (fast, consistent) or invest in a
   side-by-side diff editor (closer to VS Code, no primitive exists). Recommendation: **unified in v1**.
5. **Agent tools in v1** — read-only `git_status`/`git_diff`/`git_log`. Recommendation: **yes, M5**.

---

## 11. M0 results (implemented and verified)

M0 is done except for the final in-panel confirmation of the Remote round-trip. What exists now:

### 11.1 What was built

| Artifact | Path | Notes |
|---|---|---|
| Workspace root | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | pnpm workspace; the store is pinned (see 11.5) |
| Face aggregates | `tsconfig.host.json`, `tsconfig.client.json` | Host face is also the marker the Typert plugin walks up to; their `references` are the package inventory |
| Plugin package | `packages/git-explorer/` | `@jpolv/dsh-git-explorer` — bundle + host + client in one package |
| Host half | `packages/git-explorer/src/index.ts`, `src/git/commands.ts`, `src/types.ts` | `GitExplorerService extends TypertRemoteService`, `super(ctx, 'git')`, one `@Remote ping(sessionId, signal)`; the git runner copies the shipped `dsh-workspace-changes` invocation shape |
| Client half | `packages/git-explorer/src/client/{index.ts,GitBody.tsx,GitTitle.tsx}` | Registers tab type `git` (id = package name, `priority: 'extension'`, guide card `order: 5`), body seat `sidebar.right.pane.tab`, chip seat `sidebar.right.pane.tab.title` |
| Bundle patch | `packages/git-explorer/cordis.patch.yml` | `- insert: [{ id: git-explorer, name: '@jpolv/dsh-git-explorer' }]` |
| Generated protocol mirror | `packages/typert-protocol/` | Generated by `packages/git-explorer/scripts/vendor-typert-protocol.mjs` on every host build (see 11.3) |
| Host build | `tsdown.host.config.ts` + `tsconfig.build.host.json` | tsc → `lib/types/**`, tsdown → `lib/index.js`, Typert → `lib/typert.host.js` + `lib/typert.remote-client.js` |
| Client build | `tsdown.client.config.ts` + `tsconfig.build.client.json` | closure-factory bundle → `lib/client.js` (+ map) |
| Diagnostics | `packages/git-explorer/scripts/probe-typert.mjs` | Runs the Typert generator directly and prints what it discovers/emits |

Installed into the `desktop` profile as a packed tarball through `plugin_manager install_bundle`; the manager reported `application: applied`, the profile's `dsh.profile.bundles` gained `@jpolv/dsh-git-explorer`, and the **Git card is live on the Start page** of the running GUI.

### 11.2 The client bundle contract (verified, not inferred)

`lib/client.js` must be a CJS closure factory; three build options are load-bearing:

```js
window.__ModuleLoader__.load({ id: "@jpolv/dsh-git-explorer", factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;   // ← tsdown `intro`
  …body, externals via require()…
  exports.apply = apply; exports.inject = inject; exports.name = name;
  return module.exports;                                        // ← loader stores the return value
} });
```

* `intro` declares `module`/`exports`; without it the bundle dies with `exports is not defined`.
* `outputOptions.entryFileNames: 'client.js'` — with `"type": "module"` a CJS build otherwise emits `client.cjs`, which no URL convention resolves.
* `id` must equal the package name, and the factory must return `module.exports`.
* Externals resolve against the page's **frozen module table** (9 keys at 0.2.0-rc.2: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `dsh-client-store`, `dsh-client-ui-slots`, `dsh-client-ui-primitives`, `dsh-client-ui-dockkit`). The repo's rc.5 `PLATFORM_MODULES` list is stale; do not copy it.
* `sourcemap: true` keeps the artifact shape the loader expects (host reads `<clientPath>.map`).

### 11.3 The Typert out-of-tree constraint (the big discovery)

The generator recognizes a Remote contract only when the protocol symbols it must match are declared inside a **registered workspace project**, and registrations come from the aggregate tsconfig's `references` restricted to `<root>/packages/**` (`analyzer.js`: `loadRegistrations`, `registrationForFile`, `isTypeMetaSymbol`). An out-of-tree plugin resolves `@deepseek-ai/dsh-typert-protocol` from `node_modules`, which is never a registration, so generation fails with *"publishes Remote artifacts but has no Remote methods"*.

The repository therefore generates a **declarations-only mirror** of the protocol under `packages/typert-protocol/` (same package name, `src/**` + `lib/types/**`, internal `.ts` specifiers rewritten to `.js`), referenced by both aggregates. Three further rules had to be satisfied, each discovered from a precise generator error:

1. **Remote boundary types need a public non-root subpath** → wire types live in `src/types.ts`, exported as `./types`.
2. **A Remote cancellation parameter must be named `signal` and typed with the *default-lib* `AbortSignal`** → the Host configs must not pin `lib: ["es2024"]` (which resolves `AbortSignal` from `@types/node` instead).
3. **Every declaration in the analyzed program must belong to a registered face** → the host half must not import DSH packages' declarations (`dsh-session`, `dsh-subprocess`); it reads `ctx.sessions`/`ctx.subprocess` through small structural interfaces instead.

Two path-mapping faces are needed and must stay split: the **aggregate** maps the protocol to the mirror's `src` (the analyzer looks the module up by its source path), while the **package build** maps it to the mirror's `lib/types` declarations (a source file outside `rootDir` would break the build).

Also: the analyzer walks **named** public exports — a default-only class is invisible to it — so the service class is exported both ways. And `validateExport` requires `files` to list `lib/typert.host.{js,d.ts}` and `lib/typert.remote-client.{js,d.ts}` explicitly.

### 11.4 Verification notes (tools that mislead)

* The `cordis_inspect` **host Service and Event catalogs are build-time artifacts** of the shipped packages; a third-party plugin can never appear in them no matter how healthy it is. Use the Config provider (it shows the live loader entry, its `packageDir`, and its projected Config schema) instead.
* The client `keyDomain: "… none are taken yet"` strings are likewise catalogue annotations, not live occupant lists.
* `GET /plugins/<package>/client.js` returns 404 for shipped bundles too — it is not a usable liveness probe.
* The decisive check for a client contribution is the GUI itself.

### 11.5 Environment blockers found (and fixed)

* The machine-global pnpm store points at `G:\packages\pnpm`, but **this machine has no `G:` drive**, so every `pnpm install` failed with `ENOENT … mkdir '\\?'` — including the plugin manager's own install. Fixed by pinning `storeDir: D:/packages/pnpm` in this repository's `pnpm-workspace.yaml` and in `C:\Users\jpolv\.dsh\profiles\desktop\pnpm-workspace.yaml`. The global setting is still broken for every other project on this machine.
* The `desktop` profile had no `compatibility.json` and the install passed the version gate with peer `@deepseek-ai/cordis ~4.0.4`; pnpm still printed a peer-dependency warning that is worth reading on the next install.

### 11.6 M0 exit criteria — met

| Criterion | Status |
|---|---|
| Git card on the Start page | ✅ confirmed in the running GUI |
| Git tab opens and renders its body | ✅ confirmed (after the `inject`-factory fix) |
| Host Remote round-trip (`remote.git.ping`) | ✅ **`host bridge: connected`** — generated Remote client → host service |
| Generated Typert artifacts usable out-of-tree | ✅ host descriptors + client projection emitted and consumed |
| Client bundle contract validated | ✅ passes the structural acceptance check |
| Artifacts installed in the profile | ✅ tarball install applied live; `dsh.profile.bundles` updated |
| `git`/`cwd` values inside the panel | ⏳ blocked only by the fact that the **running host half predates the working-directory resolution chain**; the client half already renders those rows once the host reloads (see 11.7) |

### 11.7 The dev loop, measured

| Change | What it takes to see it |
|---|---|
| Client half (`lib/client.js`) | rebuild → copy the file (+`client.js.map`) into `<profile>/node_modules/@jpolv/dsh-git-explorer/lib/` → **reload the page**. Verified: the page re-requests the bundle with a new revision and the new body renders; no app restart |
| Host half (`lib/index.js`, Typert artifacts) | rebuild → reinstall → **restart the app**. A replaced package reports `application: 'restart-required'` ("package replacements require restarting the process to load a fresh JavaScript module generation"); editing files in place does not reload the loaded module |
| A brand-new package | install applies live (`application: 'applied'`) — that is how M0's first build reached the GUI without a restart |
| Any `pnpm` work in the profile | only works after the store fix in 11.5 |

Client-side rules learned while getting the body to render, worth carrying into M1:

* A slot's `inject` face must be a **factory** `(sessionId, actions) => props`; passing an object yields an empty pane with no error.
* A plugin must **mount its own generated Remote contract** (`ctx.remote.$mount(TYPERT_REMOTE)`), because nothing else in the runtime mounts a third-party package's contribution.
* Access to a namespaced service such as `remote.git` is refused unless it was obtained through `inject` — and that binding only exists after the mount, so host calls are bound in a scoped `ctx.inject(['remote.git'], …)` callback.
* Inlining the generated contract pulls `zod` into the client bundle: ~180 kB (≈39 kB gzipped) for one method. M1 should either accept it for a lazily loaded bundle or trim the contract's schema surface.

---

## 12. M1 results (read-only Source Control panel)

### 12.1 Host half

| Piece | Where | Notes |
|---|---|---|
| Status read | `src/index.ts` → `@Remote status(sessionId, requestRoot, signal)` | `rev-parse --show-toplevel --absolute-git-dir`, then `status --porcelain=v2 -z --branch --untracked-files=all`; returns the whole panel payload in one call |
| Parser | `src/git/status.ts` | pure function over git's output; groups staged / unstaged / untracked / conflicted, keeps rename originals and scores, honours `maxFiles`, reports unclassifiable records instead of dropping them |
| Root resolution | `src/git/repo.ts` | chain: live Session header → persistence → the panel's `requestRoot` → `sandboxPolicy.workspaceRoot`; the winning link is reported as `rootSource`, so a surprising directory is visible |
| Operation state | `detectOperation` | marker refs (`MERGE_HEAD`, `REBASE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`) name an in-progress merge/rebase/etc. |
| Diagnostics | `@Remote ping(sessionId, requestRoot, signal)` | the M0 probe, kept as the panel's "why is this empty" entry point |

`Config` now carries `gitPath`, `timeoutMs`, `outputMaxBytes`, `maxFiles`. Every command still runs through the shipped runner shape (scrubbed env, `GIT_TERMINAL_PROMPT=0`, bounded output, timeout composed with the caller's signal).

### 12.2 Parser tests over real git output

`tests/status.test.ts` — **16 tests, all passing** — reads byte fixtures produced by real repositories through `tests/fixtures/status/regenerate.ps1` (clean, staged/unstaged/partially-staged, untracked incl. nested, deleted both ways, renamed, added, ahead-behind with upstream drift, detached, unborn, conflict, path-with-spaces, not-a-repo), plus hand-written edge shapes (a rename's separate original-path token, an unclassifiable record, the entry cap).

### 12.3 Host-side acceptance outside the app

`scripts/probe-status.mjs` constructs the real service with a real Cordis context whose `subprocess` provider is `node:child_process` and whose `sessions` provider returns one fixed directory, then prints what the panel would render:

* `L:/source/deepseek-harness` → `repo yes`, `git version 2.53.0.windows.2`, `master → gitea/master ↑0 ↓0`, two untracked entries — matching `git status`.
* this plugin workspace → `repo no` with the note `fatal: detected dubious ownership in repository at 'L:/source/deepseek-harness-git-explorer-plugin'`, i.e. the error path renders instead of failing silently.

### 12.4 Client half

`src/client/GitBody.tsx` renders one status read: branch line (name, `↑ahead ↓behind`, in-progress operation), the four groups with status letters and rename originals, a conflict banner, `No changes` / `Not a git repository` / error states, a Refresh control, and a diagnostics footer (session, workspace, root source, git version, note, plugin build). Styling is inline over the documented `--dsw-alias-*` tokens; M1.5 moves it to CSS Modules with the shipped primitives.

The panel passes the client's own view of the session working directory as `requestRoot`, which is what makes it work even though the host's own Session lookup returned nothing for this session inside the app (see 11.6): with a Session-store answer the host prefers its own resolution and reports `header`, otherwise it reports `request`.

### 12.5 Environment finding: the ownership guard

The plugin workspace carries a `.git` created when the memory vault bound the repository, and every git command against it fails with `detected dubious ownership` because the directory's owner SID differs from the current user. The panel surfaces that as a note; the remedy is git's own suggestion:

```powershell
git config --global --add safe.directory L:/source/deepseek-harness-git-explorer-plugin
```

The plugin deliberately does **not** pass `-c safe.directory=…` itself: silently overriding a security check on the user's behalf is worse than showing the error and the one-line remedy.

### 12.6 Lessons this milestone cost (all now encoded in the code or the tests)

1. **Every generated Remote method resolves to a `RemoteResult` envelope**, not the payload: `{ ok: true, value } | { ok: false, error }`. Reading a payload field off the envelope yields `undefined` silently — that is what made the first M1 panel fail with `Cannot read properties of undefined (reading 'length')`, and why M0's "plugin build" row showed an empty value. Unwrap in one place, and test the panel in a DOM so this cannot come back.
2. **Cordis refuses a service property read that the plugin did not inject**: reading `ctx.sessions` while `inject` lists only `subprocess` throws `cannot get property "sessions" without inject` at call time — inside the Remote method, not at load. Services the plugin requires go in `static inject`; optional ones are read through `ctx.get(name)`, which needs no declaration.
3. **A tab body that throws renders as an empty pane.** The panel now carries a small error boundary that prints the failure; both real defects above were found by that boundary within seconds of the user opening the tab.
4. **The slot engine may hand a fresh business face on every render**, so a body must not depend on the injected callbacks' identity in an effect (it re-runs, writes state, and loops). The panel reads them through a ref.
5. **Host changes need an app restart; client changes need only a page reload** — the loop is: host → rebuild → `pnpm pack` → install (manager reports `restart-required`) → restart; client → rebuild → copy `lib/client.js` into the profile package → reload.

## 13. Tree view (M1.5)

The change groups render as a directory tree, matching the shape of VS Code's Source Control view:

| Piece | Where | Notes |
|---|---|---|
| Grouping | `src/client/change-tree.ts` | pure: nests files under directories, directories before files, natural case-insensitive order, and **compacts** a chain of single-child directories into one row (`.tools/notes/scratch/lib`), exactly as VS Code does |
| Rows | `src/client/GitBody.tsx` | directory rows carry a chevron and a folder glyph; file rows carry the shipped `FileTypeIcon`/`classifyFileType` glyph, the name, the rename's original name, and the status letter right-aligned in its tone; every group header carries a count badge |
| Icons | `@deepseek-ai/dsh-client-ui-primitives` | chevrons, folder glyphs and file types come from the shipped primitives, which the page resolves from its frozen module table (they are never bundled) |
| Collapse state | `localStorage` under `dsh.git-explorer.collapsed.v1.<sessionId>` | groups and directories collapse independently, and a reopened tab keeps the shape it was left in |

Tests: `tests/change-tree.test.ts` (8: nesting, ordering, compaction boundaries, spaces in names, empty groups, visible directory rows) plus the panel suite (8, now including directory and group collapse). The primitives are stubbed for tests (`tests/support/primitives-stub.tsx` plus a `vitest.config.ts` alias) because the shipped bundle's own dependencies are not linked in this repository — at runtime the page supplies them.

**Verified in the running GUI**: nested folders with chevrons, file-type glyphs, compacted chains, right-aligned status letters, and click-to-collapse all behave as specified on this repository's 184 untracked files. Shipped as a client-only change (rebuild → copy bundle into the profile → page reload), with all 32 unit tests green.

## 14. Mutations (M2): stage, unstage, discard, commit

### 14.1 Host half

| Verb | Command | Notes |
|---|---|---|
| `stage(sessionId, root, paths, signal)` | `git add -- <paths…>` | |
| `unstage(…)` | `git restore --staged -- <paths…>` | leaves the work tree untouched |
| `discard(…, trackedPaths, untrackedPaths, confirmed, signal)` | `git restore -- <paths…>` + `git clean -f -- <paths…>` | refused without `confirmed`; git spells tracked and untracked restoration differently |
| `commit(…, message, amend, signal)` | `git commit [-‑amend] -F -` | the message travels on stdin, so quoting and length cannot bite; an empty message is refused |

Every argv is built by a pure function in `src/git/mutations.ts` and every path list ends with `--`, so a file named like an option can never be read as one. `runMutation` folds git's refusal into `{ ok: false, detail }` — the panel shows git's own words rather than a generic error.

### 14.2 Host-side acceptance outside the app

`scripts/probe-mutations.mjs` builds a scratch repository, applies the plugin through a **real Cordis context**, and asserts the repository's actual state after each verb: stage → staged and no longer unstaged; unstage → reversed; discard without confirmation → refused; discard with confirmation → the work tree matches HEAD; untracked discard → the file is gone; empty message → refused; commit → HEAD advances and the tree is clean; amend → HEAD does not advance. **All checks pass.**

One fixture lesson worth keeping: Git for Windows defaults to `core.autocrlf=true`, so a scratch repository written with LF files reports "modified" after a checkout that wrote CRLF — the harness now pins `core.autocrlf=false`, because that difference is the fixture's, not the verb's.

### 14.3 Client half

* **Message box** — a textarea with `Message (Ctrl+Enter to commit)`, an **amend** toggle, and a Commit button that is disabled until a message exists; Ctrl/Cmd+Enter commits, and the box clears on success.
* **Row actions on hover** — stage (`+`), unstage (`×`) and discard (trash) replace the status letter while the pointer is on the row, matching the screenshot's affordance.
* **Group actions** — `Stage all` on Changes and Untracked, `Unstage all` on Staged changes.
* **Discard confirmation** — the row asks inline ("Discard N change(s)? This cannot be undone.") and only then calls the host with `confirmed: true`; the host refuses an unconfirmed discard independently, so the gate does not depend on the UI.
* **Result line** — every mutation reports what it did, in green or red, and the panel re-reads the status afterwards.

### 14.4 Tests

39 tests, all passing: 16 parser (real git fixtures), 8 tree, 15 panel — the panel suite now covers committing a typed message, Ctrl+Enter, the empty-message refusal, bulk staging, single-row staging and unstaging, and the discard confirmation round-trip (including that the host is not called before the person confirms).

### 14.5 Still open

Sandbox confinement and approval for mutating verbs (M2.5): the panel gates destructive actions and the host requires `confirmed`, but the commands themselves are not yet run through `ctx.sandbox.confine` / `ctx.approval.request` when a session's policy is narrower than this one. Tracked in §7 as M6 alongside push/pull.

**Verified in the running GUI**: after the m2 install and a restart, the message box renders under the branch line, hovering a file row shows the `+` and trash actions, and `Stage all` moves a file from Changes to Staged changes against the real repository. Committed as `213caec`.

## 15. Diff view (M3)

Clicking a changed file opens a comparison tab showing the shipped unified `DiffBlock` — the same renderer the transcript's edit cards use, so a diff reads the same everywhere in the product.

| Piece | Where | Notes |
|---|---|---|
| Side reader | `src/git/diff.ts` | staged = `HEAD:<path>` against `:<path>`; unstaged = `:<path>` against the work-tree file read through `ctx.fs`; an untracked file has no old side, a deleted file no new side |
| Remote | `@Remote fileDiff(sessionId, root, path, staged, untracked, signal)` | returns `{ oldText, newText, binary, oversized, note }` |
| Tab type | `client/index.ts` | a second registered type, `git-diff`, with `multiple: true` so each file gets its own tab; opened by the panel as `openTab('git-diff', { params: { path, staged, untracked } })` |
| Body | `src/client/GitDiffBody.tsx` | reads the params from `useTabInfo`, renders the toolbar/diff with `+N −M` totals from `diffTotals`, and prints a plain notice instead of a diff for binary or oversized sides |
| Chip | `DiffTitle` | shows the file's own name (the open-time title is a generic "Diff") |

Config gained `maxFileBytes` (default 2 MiB): a side larger than that is reported, never truncated into a diff that looks complete.

Verification: `scripts/probe-diff.mjs` drives the real service through a real Cordis context against a scratch repository and asserts both sides for seven shapes — unstaged, staged, partially staged, untracked, deleted, binary, oversized — **all checks pass**. Client tests cover both sides rendering, the staged label, the binary and oversized notices, a tab with no file, and the panel's row click passing the right params (47 tests total).

Known gap: the diff tab does not yet offer "open the file itself at a line"; that needs the resource-address helper the Files panel uses and is deferred to the next UI pass.

---

## Appendix A — research artifacts produced for this plan

| Path | What it is |
|---|---|
| `.tools/runtime-0.2.0-rc.2/<pkg>/` | extraction of the **running** runtime's packages (built `lib/*.js` + contract `README.md` + `package.json` + bundle patches) — the authoritative API reference for implementation |
| `.tools/asar-read.mjs` | read-only ASAR reader (`list`, `cat`) for the installed app |
| `.tools/asar-extract.mjs` | extracts package subtrees from `app.asar` into `.tools/runtime-0.2.0-rc.2/` |
| `L:\source\deepseek-harness` | the 0.1.0-rc.5 checkout — used only for conventions (`docs/web-styling.md`, the client tsdown preset, skill/notes taxonomy) |
| `C:\Users\jpolv\.dsh\profiles\desktop\` | the live profile: `package.json` (bundles), `cordis.patch.yml` (patch layer), `compatibility.json` (version exemptions, if any) |

## Appendix B — first commands once the plan is approved

```powershell
# 1. scaffold the workspace (root package.json, pnpm-workspace.yaml, tsconfigs, tsdown.config.ts)

# 2. dependencies pinned to the running runtime
pnpm add -D @deepseek-ai/cordis@~4.0.4 typescript tsdown tsx vitest @testing-library/react
pnpm add -D @deepseek-ai/dsh-subprocess@0.2.0-rc.2 @deepseek-ai/dsh-tools@0.2.0-rc.2 `
            @deepseek-ai/dsh-typert-protocol@0.2.0-rc.2 @deepseek-ai/dsh-typert-generator@0.2.0-rc.2 `
            @deepseek-ai/dsh-client-ui-slots@0.2.0-rc.2 @deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2 `
            @deepseek-ai/dsh-client-ui-sidebar-right@0.2.0-rc.2 @deepseek-ai/dsh-client-shortcuts@0.2.0-rc.2 `
            @deepseek-ai/dsh-client-locale@0.2.0-rc.2 @deepseek-ai/dsh-client-test-runtime@0.2.0-rc.2

# 3. M0 spike: static Git card + tab body, then a Remote round-trip
pnpm build
# install via Settings → Plugins (absolute path), then verify the card and HMR
```
