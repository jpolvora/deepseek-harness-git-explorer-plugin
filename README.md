# Git Explorer for DeepSeek Harness

Out-of-tree plugin that adds first-class **Git (Source Control)** to the DeepSeek Harness
Web GUI: a Git tab in the right sidebar, a Git card on the Start page, file staging,
commits, diffs, history and branches — plus read-only agent tools over the same service.

- **Targets:** DSH desktop `0.2.0-rc.2` API surface (host protocol v4,
  `@deepseek-ai/cordis` `~4.0.4`).
- **Status:** M2 shipped — stage / unstage / discard / commit, verified in the running
  GUI. The full milestone plan lives in [PLAN.md](PLAN.md).
- **Additive & removable:** no changes to shipped `@deepseek-ai/dsh-*` packages.

## Install

```sh
pnpm install && pnpm build && pnpm pack:plugin
```

This drops a tarball in `dist/`. Install it as a bundle through the DSH plugin
manager (it accepts an absolute local path), approve build scripts if prompted, then
reload and open the **Git** card on the Start page. Install logs stream under
`<profile>/.plugin-manager/logs`.

## Develop

Requirements: Node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`.
(This machine has no `G:` drive, so `pnpm-workspace.yaml` overrides the pnpm
`storeDir` to `D:/packages/pnpm` — keep that override.)

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `pnpm build`         | Host + client bundles into `packages/git-explorer/lib/`   |
| `pnpm typecheck`     | `tsc --noEmit` for host and client projects               |
| `pnpm test`          | `vitest run` (status parser, change tree, panel)          |
| `pnpm watch:client`  | Rebuild the client bundle on save (HMR in the running GUI)|
| `pnpm pack:plugin`   | `pnpm pack` the plugin into `dist/`                       |
| `scripts/probe-*.mjs`| Drive the host service through a real Cordis context      |

## Layout

- `packages/git-explorer/src/` — host service (`index.ts`), git verbs (`git/`),
  sidebar panel (`client/`).
- `packages/git-explorer/tests/` — vitest suites; `fixtures/status/` holds recorded
  git outputs (regenerate with `regenerate.ps1`).
- `packages/git-explorer/scripts/` — `probe-*.mjs` verification probes against
  scratch repositories.
- `packages/git-explorer/lib/` — **committed build output**. The DSH host loads the
  built artifact (`lib/client.js`, `lib/index.js`, typert files), so `lib/` is
  rebuilt and committed together with `src/`.
- `packages/git-explorer/locale/` — `en` / `zh` strings.
- `packages/typert-protocol/` — companion types for the host↔client Remote protocol.
- `.tools/` — asar helpers and durable research notes. The readable
  `0.2.0-rc.2` runtime extraction is git-ignored; recreate it with
  `.tools/asar-extract.mjs`.
- `PLAN.md` — implementation plan and verified platform surface.

Agent working agreements live in [AGENTS.md](AGENTS.md).

## License

MIT, as declared in `packages/git-explorer/package.json`.
(No `LICENSE` file has been added yet.)
