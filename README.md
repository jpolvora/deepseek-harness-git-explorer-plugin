# Git Explorer for DeepSeek Harness

```
+-------------------------------------------------------+
|                                                       |
|    o--------o--------o   main                         |
|              \                                        |
|               o--------o   feature/draft  +32 -8      |
|                                                       |
|    M   src/client/GitBody.tsx   ........  +48 -12     |
|    A   src/git/numstat.ts       ........  +96 -0      |
|    D   src/client/OldPanel.tsx  ........  +0 -210     |
|                                                       |
+-------------------------------------------------------+
```

Out-of-tree plugin that adds first-class **Git (Source Control)** to the DeepSeek Harness
Web GUI: a Git tab in the right sidebar, a Git card on the Start page, file staging,
commits, diffs and per-file line counts — plus read-only agent tools over the same service.

- **Package:** `dsh-plugin-git-explorer` — one installable bundle carrying the Cordis
  service + Typert Remote + agent tools (host half) and the sidebar panel (client half).
  The repository **root** is that bundle; it points at the build project under
  `packages/git-explorer/`, which is where the sources, the committed `lib/` and the tests
  live.
- **Targets:** DSH desktop `0.2.0-rc.2` API surface (host protocol v4,
  `@deepseek-ai/cordis` `~4.0.4`).
- **Status:** `0.1.0-m6`. The panel does change tree, staging, commits, diffs, per-file
  counts, a remembered commit draft and "open file from diff"; the milestone plan and the
  verified platform surface live in [PLAN.md](PLAN.md).
- **Additive & removable:** no shipped `@deepseek-ai/dsh-*` package is modified; removing
  the bundle removes one Cordis row.

## Features

- **Change tree** — staged, unstaged and untracked files at a glance, with per-file
  `+added / -removed` line counts.
- **Stage, unstage, discard** — per-file and per-hunk actions; destructive verbs ask for
  explicit confirmation.
- **Commits** — commit message draft is remembered across sessions; empty messages are
  refused instead of failing silently.
- **Unified diffs** — one `DiffBlock` view for staged, unstaged and commit diffs, with
  "open file from diff" to jump to the source.
- **Agent tools** — read-only `git_status`, `git_diff` and `git_log` over the same host
  service, so agents see exactly what the panel sees.
- **Shell-free git** — every git invocation is a pure, unit-tested argv array (paths
  terminated with `--`, messages on stdin), run with a fixed locale, locked-down
  environment and bounded output.

## Install

In the app: **Plugins → Add plugin**, then paste one of these.

| Route | What to paste |
| --- | --- |
| npm (after the first publish) | `dsh-plugin-git-explorer` |
| GitHub | `https://github.com/jpolvora/deepseek-harness-git-explorer-plugin` |
| A clone on disk | `<clone>` (the repository root) |
| A packed tarball | the `.tgz` path or URL from `pnpm pack:plugin` |

The repository commits its built `lib/`, so an install from GitHub or a clone needs no
build step on the consumer's machine. Full walkthrough, requirements and removal:
[docs/INSTALL.md](docs/INSTALL.md).

## Develop

Requirements: Node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`.
(This machine has no `G:` drive, so `pnpm-workspace.yaml` overrides the pnpm `storeDir` to
`D:/packages/pnpm` — keep that override.)

| Command | What it does |
| --- | --- |
| `pnpm install` | installs the toolchain and the `packages/typert-protocol` mirror |
| `pnpm build` | host + client bundles into `packages/git-explorer/lib/` (**committed**) |
| `pnpm typecheck` | `tsc --noEmit` for the host and client projects |
| `pnpm test` | `vitest run` (status parser, change tree, numstat, panel, locales, diff panel) |
| `pnpm watch:client` | rebuild the client bundle on save (HMR in the running GUI) |
| `pnpm pack:plugin` | `prepack` builds, then `pnpm pack` writes `dist/*.tgz` |
| `pnpm probe:compat` | check the installed runtime still offers every contract |
| `node packages/git-explorer/scripts/probe-<area>.mjs` | drive the host service through a real Cordis context |

## Layout

- `package.json` — the published bundle: `dsh.bundle.patch`, `dsh.client`, `files`, and
  `main`/`exports` pointing into the build project.
- `cordis.patch.yml` — the bundle patch that inserts the plugin row (row name = package name).
- `packages/git-explorer/` — the Cordis/Typert build project (private, never installed on
  its own):
  - `src/` — host half (`index.ts`, `git/` argv builders and runners, `tools.ts`) and
    client half (`client/`: panel, diff view, change tree, locales, CSS Modules).
  - `tests/` — vitest suites; `tests/fixtures/status/` holds recorded git outputs
    (regenerate with `regenerate.ps1`).
  - `scripts/` — `probe-*.mjs` verification probes against scratch repositories, plus
    `vendor-typert-protocol.mjs`, which regenerates the type mirror on every host build.
  - `lib/` — **committed build output**. The DSH host loads the built artifact
    (`lib/index.js`, `lib/client.js`, the typert files), so `lib/` is rebuilt and committed
    together with `src/`.
  - `locale/` — `en` / `zh` strings for the panel.
- `packages/typert-protocol/` — generated declarations-only mirror of the Typert protocol,
  registered as a workspace project so the analyzer recognizes the Remote contract. Never
  imported at runtime.
- `.tools/` — asar helpers and durable research notes. The readable `0.2.0-rc.2` runtime
  extraction is git-ignored; recreate it with `.tools/asar-extract.mjs`.
- `PLAN.md` — implementation plan and verified platform surface. §19 explains why the
  bundle and the build project are two packages.

Agent working agreements live in [AGENTS.md](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE).
