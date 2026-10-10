# AGENTS.md — working in this repo

## What this is

`dsh-plugin-git-explorer`: an out-of-tree DSH plugin (right-sidebar Git tab + Start
page card) with a Cordis host service, a Typert Remote, a React client panel, and
agent tools (`git_status`, `git_diff`, `git_log`). Two packages in one repository, BOTH
carrying the package name `dsh-plugin-git-explorer`: the **root** is the published bundle
(bundle patch, `dsh.client`, entry points into the build output), and
`packages/git-explorer/` is the private Cordis/Typert build project where `src/`, `lib/`,
`tests/` and `scripts/` live. Both identities must share the name for runtime reasons
(PLAN.md §19): the analyzer only registers projects under `packages/`, and the Typert
loader binds generated artifacts to the mounting package, so the build project must be
stamped with the installed name. pnpm tolerates a member named like the root workspace
package; the root scripts address the build project by directory (`pnpm -C …`), never by
`--filter`. Spec and platform contract: `PLAN.md`. Targets DSH desktop `0.2.0-rc.2` only.

## Commands (run from root)

- `pnpm install` / `pnpm build` (host + client) / `pnpm typecheck` (`tsc --noEmit` × 2)
- `pnpm test` (`vitest run`) / `pnpm watch:client` (HMR loop) / `pnpm pack:plugin`
- `node packages/git-explorer/scripts/probe-<area>.mjs` — verify against a scratch
  repo through a real Cordis context; assert repo state after each verb.
  `pnpm probe:compat` checks the installed runtime still offers every contract.
- Never run `pnpm build` / `pack:plugin` while another agent is mid-edit of `src/`:
  outputs land in committed `lib/` and `dist/` and will collide.

## Layout

- `package.json` — the published bundle; `cordis.patch.yml` — its patch (row name must
  equal the root package name).
- `packages/git-explorer/src/index.ts` — plugin entry, service + tool registration.
- `packages/git-explorer/src/git/` — pure argv builders + runners (`commands.ts`,
  `mutations.ts`, `status.ts`, `repo.ts`, `diff.ts`); `src/client/` — panel
  (`GitBody.tsx`, `GitTitle.tsx`, `change-tree.ts`); `src/types.ts`, `src/contract` —
  shared shapes.
- `packages/git-explorer/tests/` + `tests/fixtures/status/` (recorded git outputs,
  `regenerate.ps1` refreshes them); `scripts/` (probes + the protocol mirror
  generator); `lib/` (**committed** build output); `locale/` (en, zh).
- `packages/typert-protocol/` — generated, declarations-only mirror of the Typert
  protocol, registered so the analyzer recognizes the Remote contract.
- `.tools/notes/` — durable research notes (kept); `.tools/scratch/` and
  `.tools/notes/scratch/` — throwaway (ignored).

## Non-negotiable conventions

1. **`lib/` is committed.** The host loads the built artifact, so every `src/`
   change ships with a rebuilt `lib/` in the same commit (`pnpm build`).
2. **Git argv is pure and shell-free.** Build argv in pure, unit-testable functions;
   terminate every path list with `--`; never interpolate a shell; commit messages
   travel on stdin (`commit -F -`).
3. **Destructive verbs need explicit confirmation** (`discard`/`clean` take a
   confirmation flag); commit refuses an empty message. Return git's own first
   stderr line as the failure detail — don't throw raw errors at the panel.
4. **Fixed git environment:** `GIT_CONFIG_COUNT=0`, `GIT_TERMINAL_PROMPT=0`,
   `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`; bounded stdout/stderr; `graceMs` + abort
   timeout. `rev-parse` exit 128 with `/not a git repository/i` means "not a repo".
5. **Remote shape:** `TypertRemoteService` subclass, scope parameter first, `signal`
   last; failures are `RemoteError('<domain>/<reason>', msg, details)`.
6. **Client UI:** shipped `@deepseek-ai/dsh-client-ui-primitives` only; unified
   `DiffBlock` for diffs (no side-by-side primitive exists). CSS Modules +
   `--dsw-alias-*` semantic tokens, no literal colors, no theme branches.
7. **Additive only.** Never modify or fork shipped `@deepseek-ai/dsh-*` packages.
   No credential storage, no `git config` editing, no push/pull/fetch UI (tracked
   for a later milestone via a terminal handoff).
8. **pnpm `storeDir` override** in `pnpm-workspace.yaml` stays (this machine has no
   `G:` drive).
9. **Versioning:** in-repo milestone versions are `0.1.0-m<N>`; commit subjects like
   `M2: stage, unstage, discard and commit`. A published version is a release
   version (`0.1.0`) — npm's `latest` tag never points at a prerelease.
10. **One installed name.** The root package name, the `cordis.patch.yml` row name, the
    client bundle's loader id (`tsdown.client.config.ts`), the tab ids in `src/types.ts`,
    the name the profile records AND the build project's `name` in
    `packages/git-explorer/package.json` must stay identical — the loader binds rows and
    the Typert loader binds generated artifacts to it. The build project is private,
    never installed on its own, never addressed by `--filter`.

## Verify before ship

`pnpm typecheck && pnpm test && pnpm build`, then install the `dist/*.tgz` in the
desktop profile and confirm the panel behavior in the running GUI.
