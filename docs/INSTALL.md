# Installing the Git Explorer in DSH 2

`@jpolv/dsh-git-explorer` adds a **Git** tab to the right sidebar (change tree, staging,
commits, diffs), a **Git** card on the Start page, and three read-only agent tools
(`git_status`, `git_diff`, `git_log`).

Install it from the app: **Plugins → Add plugin**. The dialog accepts a package name, a
GitHub repository address, or a local directory path.

## 1. From npm (recommended)

```
@jpolv/dsh-git-explorer
```

The dialog offers the official npm registry, the mainland-China mirror, or a custom
address; any of them works once the package is published there. Pin a version if you want
reproducibility (`@jpolv/dsh-git-explorer@0.1.0`).

Publishing is a maintainer step — this repository ships the artifacts and the packaging
metadata:

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @jpolv/dsh-git-explorer pack:plugin    # dist/jpolv-dsh-git-explorer-<version>.tgz
npm version 0.1.0 --workspace packages/git-explorer  # release versions drop the -m<N> suffix
npm publish --workspace packages/git-explorer        # needs an npm token with publish rights
```

## 2. From a clone (works today, no registry)

```bash
git clone https://github.com/jpolvora/deepseek-harness-git-explorer-plugin
```

Then point **Add plugin → local directory path** at the package directory inside the clone:

```
<clone>/packages/git-explorer
```

The package ships its built `lib/`, so this needs no build step on the consumer's machine.
A local `.tgz` from `pnpm pack:plugin` installs the same way.

## 3. From a release tarball

Each tagged release attaches the packed tarball; install it by its URL with the plugin
manager tool:

```
plugin_manager install_bundle https://github.com/jpolvora/deepseek-harness-git-explorer-plugin/releases/download/v<version>/jpolv-dsh-git-explorer-<version>.tgz
```

## Requirements

| Requirement | Why | Check |
|---|---|---|
| DSH desktop **0.2.0-rc.2 or newer in the 0.2 line** | the plugin declares `@deepseek-ai/dsh-typert-protocol >=0.2.0-rc.2 <0.3` and `@deepseek-ai/cordis ~4.0.4` as peers, so the runtime's own copies are used | `pnpm probe:compat` (root) or `node scripts/probe-compat.mjs` (package) |
| `git` on `PATH` | every read and write shells out to real git, never a library | `git --version` |
| a reachable pnpm **store** | the plugin manager installs through pnpm; a store path on a missing drive fails with `ENOENT mkdir '\\?'` | `pnpm store path` |
| `safe.directory` for the workspace | git refuses repositories owned by another account, and this plugin deliberately does not pass `-c safe.directory` | `git config --global --add safe.directory <path>` |

## Verifying the install

1. `node packages/git-explorer/scripts/probe-compat.mjs` — asserts the runtime version, the
   frozen client module table, the `sidebar.right.*` slot keys, the plugin's artifacts and
   all nine Remote endpoints. It exits non-zero with the missing contract named.
2. In the app: the **Git** entry appears on the Start page and a **Git** tab opens in the
   right sidebar showing the current branch, the change groups and a message box.
3. Ask the agent for `git_status` — the tools register with the host, so a working install
   answers with the working tree of the session's workspace.

## Removing it

Disable the plugin in **Plugins**, or remove the bundle from the profile with
`plugin_manager remove_bundle @jpolv/dsh-git-explorer`. Nothing else is touched: the plugin
adds one Cordis row and modifies no shipped package.

## Compatibility notes

- The browser half carries no DSH code: everything under `@deepseek-ai/` is resolved from
  the page's frozen module table, so a runtime update only breaks it if that table or the
  sidebar slot names change — which is exactly what `probe:compat` watches.
- The host half imports the runtime's Typert protocol rather than bundling its own copy, so
  there is one protocol identity per process.
- `lib/` is committed in this repository, and `prepack` rebuilds it, so a tarball always
  matches the sources it was packed from.
