# Installing the Git Explorer in DSH 2

`dsh-plugin-git-explorer` adds a **Git** tab to the right sidebar (change tree, staging,
commits, diffs, per-file counts), a **Git** card on the Start page, and three read-only
agent tools (`git_status`, `git_diff`, `git_log`).

Install it from the app: **Plugins → Add plugin**. The dialog accepts a package name, a
GitHub repository address, or a local directory path; the three routes below are the same
call (`plugin_manager install_bundle`) the dialog makes.

## 1. From npm (recommended, once published)

```
dsh-plugin-git-explorer
```

The dialog offers the official npm registry, the mainland-China mirror, or a custom
address; any of them works once the package is published there. Pin a version if you want
reproducibility (`dsh-plugin-git-explorer@0.1.0`).

> The version published under npm's `latest` tag must be a **release version** (`0.1.0`),
> not an in-repo milestone build (`0.1.0-m6`): `pnpm add <name>` resolves `latest`, and npm
> does not point `latest` at a prerelease. Maintainers run `npm version 0.1.0` before the
> first publish (see the bottom of this file).

## 2. From GitHub (works today, no registry)

```
https://github.com/jpolvora/deepseek-harness-git-explorer-plugin
```

pnpm fetches the repository and installs its **root package**, which is the bundle: the
root `package.json` declares `dsh.bundle.patch`, so the plugin manager accepts it, and the
dependency is recorded under that manifest's name (`dsh-plugin-git-explorer`) — exactly the
row name in `cordis.patch.yml`. The built host and client halves ship inside the package
(`packages/git-explorer/lib/**`, listed in `files`), so nothing is compiled on your machine.

Pin a revision by appending a tag, branch or commit to the address
(`…git-explorer-plugin#v0.1.0`); without one, the default branch is installed, and
re-running the install is how you upgrade.

## 3. From a clone (local directory)

```bash
git clone https://github.com/jpolvora/deepseek-harness-git-explorer-plugin
```

Then point **Add plugin → local directory path** at the clone root:

```
<clone>
```

The repository ships its built `lib/`, so this needs no build step on the consumer's
machine. A local `.tgz` from `pnpm pack:plugin` installs the same way (paste its path, or
its release URL when a release attaches it).

> `packages/git-explorer/` is the private build project (sources, committed `lib/`, tests).
> It declares no bundle patch, so the plugin manager rejects it as a plugin — install the
> clone root, never that directory.

## Requirements

| Requirement | Why | Check |
|---|---|---|
| DSH desktop **0.2.0-rc.2 or newer in the 0.2 line** | the plugin declares `@deepseek-ai/dsh-typert-protocol >=0.2.0-rc.2 <0.3` and `@deepseek-ai/cordis ~4.0.4` as peers, so the runtime's own copies are used | `pnpm probe:compat` |
| `git` on `PATH` | every read and write shells out to real git, never a library | `git --version` |
| a reachable pnpm **store** | the plugin manager installs through pnpm; a store path on a missing drive fails with `ENOENT mkdir '\\?'` | `pnpm store path` |
| `safe.directory` for the workspace | git refuses repositories owned by another account, and this plugin deliberately does not pass `-c safe.directory` | `git config --global --add safe.directory <path>` |
| a restart after the first install | the host half is a Cordis service loaded at startup; the client half alone would hot-load, the service would not | — |

## Verifying the install

1. `pnpm probe:compat` (or `node scripts/probe-compat.mjs`) — asserts the runtime version,
   the frozen client module table, the `sidebar.right.*` slot keys, the plugin's artifacts
   and all nine Remote endpoints. It exits non-zero with the missing contract named.
2. In the app: the **Git** entry appears on the Start page and a **Git** tab opens in the
   right sidebar showing the current branch, the change groups and a message box.
3. Ask the agent for `git_status` — the tools register with the host, so a working install
   answers with the working tree of the session's workspace.

## Removing it

Disable the plugin in **Plugins**, or remove the bundle from the profile with
`plugin_manager remove_bundle dsh-plugin-git-explorer`. Nothing else is touched: the plugin
adds one Cordis row and modifies no shipped package.

## Compatibility notes

- The browser half carries no DSH code: everything under `@deepseek-ai/` is resolved from
  the page's frozen module table, so a runtime update only breaks it if that table or the
  sidebar slot names change — which is exactly what `probe:compat` watches.
- The host half imports the runtime's Typert protocol rather than bundling its own copy, so
  there is one protocol identity per process.
- `lib/` is committed in this repository and `prepack` rebuilds it, so a tarball always
  matches the sources it was packed from, and a git install works without a build step.

## Maintainer: publishing a release

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
npm version 0.1.0        # release versions drop the -m<N> suffix
npm publish              # needs an npm token with publish rights; prepack rebuilds lib/
git tag v0.1.0 && git push --follow-tags
pnpm pack:plugin         # dist/dsh-plugin-git-explorer-0.1.0.tgz, attach it to the release
```
