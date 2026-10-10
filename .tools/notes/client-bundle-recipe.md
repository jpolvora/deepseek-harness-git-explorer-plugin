# Third-party DSH client-plugin bundle recipe (target: the DSH web client shipped with `@deepseek-ai/dsh-*` 0.2.0-rc.2)

Scope: one standalone npm package (not inside the DSH monorepo) whose browser half must be loadable by the
running shell as a `window.__ModuleLoader__.load({id, factory})` registration.

## 0. Provenance — what each claim rests on

| Tag | Meaning |
|---|---|
| **[V]** | Verified empirically on this machine (a real build was run / bytes were compared). |
| **[R]** | Read directly from a file in the 0.2.0-rc.2 runtime extraction or from DSH source; quoted. |
| **[I]** | Inferred (consistent with everything read, but not executed). |

Evidence sources used throughout:

| # | Source | Version | Notes |
|---|---|---|---|
| S1 | `L:\source\deepseek-harness\packages\client\tsdown.client.ts` | 0.1.0-rc.5 (worktree `master` = commit `47f943859b`) | The shared client preset the task named. 284 lines. |
| S2 | `L:\source\deepseek-harness\packages\client\web\src\platform.ts` | 0.1.0-rc.5 | `PLATFORM_MODULES` (10 entries). |
| S3 | `git show dsh-v0.1.0-rc.8:packages/client/tsdown.client.ts` (dumped to `.tools\notes\_rc8-preset.ts`, 588 lines) | 0.1.0-rc.8 | Newer revision of the same preset: `deps.neverBundle/alwaysBundle`, `staticLinked`, `PRELOADED_CLIENT_EXTERNALS`. |
| S4 | `.tools\runtime-0.2.0-rc.2\dsh-*\lib\*.js` + `package.json` | 0.2.0-rc.2 | The 40 packages of the running runtime, as installed. Ground truth for the *contract in force now*. |
| S5 | `.tools\runtime-0.2.0-rc.2\dsh-client-modules\lib\{index,client}.js` + `README.md` | 0.2.0-rc.2 | Host half (composition/serving) and browser half (loader) — the contract's implementation. |
| S6 | `.tools\notes\_shell-index.js` = `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-5SrrfWpU.js` inside `C:\Users\jpolv\AppData\Local\Programs\DeepSeek Harness\resources\app.asar` | 0.2.0-rc.2 | The built shell: the only place the frozen module table actually exists. |
| S7 | `.tools\notes\scratch\` | tsdown 0.22.2 / rolldown 1.1.5 | The reproduction harness: builds run here, outputs preserved. |

**[V]** The scratch package `@demo/dsh-client-demo` (S7) was built repeatedly with the config in §2 and its
`lib/client.js` byte-compared against the artifacts in S4. Where the recipe says "verified", this is what it means.

---

## 1. The exact output contract

### 1.1 The literal wrapper (bytes as shipped)

`.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-files\lib\client.js:1-6` **[R]** (`<TAB>` = one 0x09 byte;
the file uses tabs, LF endings):

```
window.__ModuleLoader__.load({
<TAB>id: "@deepseek-ai/dsh-client-ui-sidebar-files",
<TAB>factory: (require) => {
<TAB><TAB>var module = { exports: {} };
<TAB><TAB>var exports = module.exports;
<TAB><TAB>Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
```

and its tail, `.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-files\lib\client.js:1020-1026` **[R]**:

```
<TAB><TAB>exports.apply = apply;
<TAB><TAB>exports.inject = inject;
<TAB><TAB>return module.exports;
<TAB>}
});

//# sourceMappingURL=client.js.map
```

**[V]** A stock `tsdown@0.22.2` build with the config in §2 produced exactly this shape
(`.tools\notes\scratch\lib\client.js`, 36 lines) — including the tab indentation, the absence of a
`"use strict"` prologue, and the position of the `Symbol.toStringTag` line *after* the injected prologue.

### 1.2 Where `id` comes from

* The preset takes it as a call-site argument: `clientBundle(id, libEntry, options)`, documented as
  "plugin id (package name), stamped into the `__ModuleLoader__.load` handoff"
  (S1:93-97, S1:85-86), and every call site passes the package name literally
  (e.g. `packages/client/locale/tsdown.config.ts:3`).
* The host keys the boot graph by the **manifest package name**: `this.table.set(packageName, …)` with
  `packageName` read from the nearest `package.json` (S5 `lib/index.js`:780-784, 883).
* Therefore `id` **must equal `package.json.name` exactly** (scoped name included, e.g.
  `@deepseek-ai/dsh-client-ui-sidebar-files`). The loader normalizes a trailing `/client` away
  (`stripClientSuffix`, S5 `lib/client.js`:98-100), so `id` must *not* carry it.

### 1.3 `module`, `exports`, `require` inside the factory

* `require` is the factory parameter, supplied by the loader: `registered.factory(this.makeRequire(ownerId, edges))`
  (S5 `lib/client.js`:683). It resolves **synchronously** in this order — seed table, memoized record,
  registered factory — and throws otherwise (S5 `lib/client.js`:697-706). `require.async(spec)` is added as a
  property of the same function (S5 `lib/client.js`:707-713).
* `module` and `exports` exist **only because the preset injects them**:
  `banner … factory: (require) => {` + `intro: 'var module = { exports: {} }; var exports = module.exports;'`
  (S1:269-271) — they are plain `var`s inside the arrow function, not CJS runtime objects.
* **[V]** Removing `intro` produces a bundle whose first statement is
  `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });` with no `var exports` declaration
  (`\.tools\notes\scratch\out-noIntro.js:1-4`) → `ReferenceError: exports is not defined` at materialization.
  `intro` is load-bearing, not cosmetic.

### 1.4 The body is CJS, never ESM

* `format: 'cjs'` (S1:178) plus `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })`
  **[V]** — emitted by rolldown itself, not by the preset (compare `out-noIntro.js:4`).
* **[V]** A `format: 'esm'` build emits no wrapper at all and keeps `import … from "react"` /
  `export { apply, inject, name }` (`out-esm.js:1-2, 21`) — an ESM bundle cannot be a classic script and has no
  `factory`/`exports` contract. Never ship ESM here.
* The host executes bundles as **classic scripts** (no `type="module"`): registrations are queued by an inline
  facade and handed over at boot (S5 `lib/index.js`:454-475), and `web boot` creates the system from
  `__ModuleLoader__.create({ boot, staticModules, … })` (S6 line 126).

### 1.5 The required tail

* **`return module.exports;` is mandatory.** The loader stores the factory's *return value* as the module's
  exports: `exports: registered.factory(…)` (S5 `lib/client.js`:683). A factory that only assigns
  `exports.x = …` and returns `undefined` would materialize as `undefined` and every consumer `require()` would
  hand back `undefined`.
* `exports.apply` / `exports.inject` are **not** module-loader requirements — they are the cordis plugin face the
  vendored Loader consumes after `internal.import(id)` resolves the entry's client half (canonical source shape:
  `packages/client/locale/src/client/index.ts:347` (`export const inject = […]`), `:355` (`export function apply`)).
  The one exception is the bootstrap package `@deepseek-ai/dsh-client-modules`, whose exports are checked
  explicitly: `typeof exports.createClientModuleSystem !== "function" || typeof exports.apply !== "function"`
  → throw (S5 `lib/index.js`:469-471).
* The wrapper call itself must close as `});` on its own line (S4, all 20+ shipped bundles).

### 1.6 Optional: package-local lazy chunks

A bundle may register extra entries whose file name matches
`/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` (S5 `lib/client.js`:470), each carrying one extra field:

```
window.__ModuleLoader__.load({
<TAB>id: "@deepseek-ai/dsh-client-ui-sidebar-documentpreview",
<TAB>chunk: "client.excel.js",
<TAB>factory: (require) => {
```
(`.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-documentpreview\lib\client.excel.js:312-316` **[R]**)

* Consumed by `require.async("./client.excel.js")` (shipped call sites:
  `.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-documentpreview\lib\client.js`:4883 and :5790, inside
  `react.lazy` loaders);
  the loader rejects any other relative shape ("invalid relative chunk request", S5 `lib/client.js`:711) and
  requires the owner to be a boot-graph row (S5 `lib/client.js`:724).
* **[V]** Production works with a *banner function*: `outputOptions.banner = (chunk) => …` (rolldown types it
  `banner?: string | AddonFunction`, `node_modules\rolldown\dist\...\define-config-BhJ90aEv.d.mts`), emitting
  `chunk: "<fileName>"` for non-entry files — `.tools\notes\scratch\lib\client.big.js:1-3`.
* A chunk must be **self-contained**: it cannot synchronously `require` another relative `client*.js`
  (S5 `README.md`:68).
* Published packages must list the chunks in `files` — upstream uses `"lib/client.*.js"`
  (`.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-documentpreview\package.json`, `files` array) **[R]**.

---

## 2. Minimal tsdown config for one package

### 2.1 The presets' literal wrapper strings (S1 vs S3 — identical)

`packages/client/tsdown.client.ts:262-272` **[R]** (S3 lines 556-564 are byte-identical):

```ts
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapPathTransform: browserSourcePath,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
```

**[V] They stay single-line in the config and are re-printed by rolldown.** Passing the *already* tab-indented
multi-line form instead produced a byte-identical file (`out-multiline.js` vs `lib/client.js`,
`identical: True`). So both spellings are safe; the shipped tabs are rolldown's printer, not the preset's string.

### 2.2 The minimal config (this exact file was built and verified)

`.tools\notes\scratch\tsdown.config.ts` — trimmed to the load-bearing lines:

```ts
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

const id = '@demo/dsh-client-demo'          // MUST equal package.json "name"
const CLIENT_EXTERNALS = [ /* §3 table */ ]

export default defineConfig({
  name: `${id}/client`,                      // diagnostics only
  entry: { client: 'src/client/index.ts' },   // ONE entry named `client`
  outDir: 'lib',
  format: 'cjs',                              // §1.4
  platform: 'browser',
  dts: false,                                 // S1:180 — dts would wrap banner/footer into .d.cts
  sourcemap: true,                            // §4
  clean: false,                               // never wipe the host half / your own outputs
  deps: {                                     // tsdown ^0.22 spelling; see 2.4
    neverBundle: (s) => CLIENT_EXTERNALS.includes(s),
    alwaysBundle: (s) => !CLIENT_EXTERNALS.includes(s),
  },
  define: {                                   // S1:197-201; browser bundles inline node-idiom deps
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [ /* purity gate + CSS-Modules-inline plugin, §2.3 */ ],
  outputOptions: {
    entryFileNames: 'client.js',              // LOAD-BEARING: see 2.4
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
```

**[V]** Output (`.tools\notes\scratch\lib\client.js`, 36 lines, 1.47 kB) — head/tail:

```
window.__ModuleLoader__.load({
	id: "@demo/dsh-client-demo",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		…
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
```

### 2.3 CSS Modules: three options (pick one)

1. **Inline them (upstream's way).** Copy the `dsh-css-modules-inline` plugin verbatim from S1:226-261
   (virtual id `\0dsh-css:<abs>.mjs`, `lightningcss.transform({ cssModules: { pattern: '[hash]_[local]' },
   minify: true })`, then a generated module that injects `<style data-plugin="<id>" data-plugin-css="<id>/<file>">`
   and default-exports the class map). **[V]** `.tools\notes\scratch\tsdown.config.ts` with this plugin emits
   `const css = "._7FGrvW_root{color:red;display:flex}"` + the class map, and **no** separate `.css` asset.
   Requires `lightningcss` as a devDependency.
2. **Skip CSS Modules entirely.** Do not import `*.module.css`; inject styles yourself. Then neither
   `lightningcss` nor the CSS plugin is needed. **[V]** If you *do* import one without a plugin, the build fails
   hard: `[plugin tsdown:css-guard] … Error: CSS file "…demo.module.css" was encountered but '@tsdown/css' is not
   installed` (from the `V_NO_CSS_PLUGIN=1` run).
3. **Install `@tsdown/css`** and let tsdown own the pipeline (then you must serve/handle the emitted asset
   yourself — the client bundle is served standalone, so upstream avoids this).

Style ownership contract if you inject tags yourself: at materialization the loader claims every
`style:not([data-plugin])` for the plugin being materialized and inventories
`style[data-plugin=<id>]`, recording `data-plugin-css` per tag (S5 `lib/client.js`:487-498). Always set
`data-plugin` to your package name so unload/HMR can remove exactly your tags.

### 2.4 Verified pitfalls (each one costs you a silent or loud failure)

| Config change | Observed result **[V]** | Consequence |
|---|---|---|
| drop `outputOptions.intro` | `exports` used, never declared (`out-noIntro.js`) | `ReferenceError` at first materialization |
| `format: 'esm'` | no wrapper, ESM syntax kept (`out-esm.js`) | loader never sees a registration |
| drop `entryFileNames: 'client.js'` | emits **`lib/client.cjs`** (package has `"type": "module"`) | host resolves `exports["./client"]` (S5 `lib/index.js`:171-180) — whatever you declare is served, but every URL convention is `…/client.js` and chunk resolution asserts `${row.id}/client.js` (S5 `lib/client.js`:484); keep the pin |
| add `fixedExtension: false` instead of the pin | still `lib/client.cjs` | the pin is the only reliable knob |
| import `@deepseek-ai/<other-plugin>` without declaring it | purity gate throws in the monorepo preset (S1:216-225) | at runtime: `require("…") missed the module table` (S5 `lib/client.js`:705) |
| keep `external` / `noExternal` | works, but 0.22.2 warns: `` `external` is deprecated. Use `deps.neverBundle` instead `` / same for `noExternal` | use `deps.*` (S3:454-462 is the newer preset's form) |

**[V]** Versions used: `tsdown 0.22.2`, `rolldown 1.1.5`, `lightningcss ^1.32.0`, Node `v22.22.2`, npm `10.9.7`.
Dependency install: `npm install` in the package (tsdown + lightningcss as devDependencies).

---

## 3. Externals: what stays a `require`, what gets inlined

### 3.1 The frozen table actually in force in the running 0.2.0-rc.2 shell **[R/V]**

Extracted from the built shell (S6, line 126, `function rM(){return{…}}`):

```js
function rM(){return{
  react: Ef,
  "react/jsx-runtime": If,
  "react-dom": Rf,
  "react-dom/client": Df,
  "@deepseek-ai/cordis": sf,
  "@deepseek-ai/dsh-client-store": lh,
  "@deepseek-ai/dsh-client-ui-slots": hh,
  "@deepseek-ai/dsh-client-ui-primitives": sE,
  "@deepseek-ai/dsh-client-ui-dockkit": XS
}}
```

Exactly those **9 specifiers** (and nothing else) are answerable by the loader's `require` as *static* entries:

```ts
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]
```

Corroboration **[V]**: scraping every `require("…")` out of all 40 shipped `client*.js` files yields exactly
`react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`,
`@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
`@deepseek-ai/dsh-client-ui-dockkit` — plus one specifier declared per package
(`@deepseek-ai/dsh-api-gateway/client`, see 3.3) and `url`/`util` inside a fully inlined third-party library.

How upstream derives it: `getStaticModules()` builds `{"<key>": <shell static import>}` with a
`satisfies Record<PlatformModule, unknown>` pin against `PLATFORM_MODULES`
(`dsh-v0.1.0-rc.8:packages/client/web/src/seed.ts`), and the preset unions
`PLATFORM_MODULES ∪ PRELOADED_CLIENT_EXTERNALS ∪ dsh.client.external` (S3:415-425; S3:8-13). The table is
**version-specific** — see the drift list in 3.4.

### 3.2 The `@deepseek-ai/*` rule

* A specifier in your package's `dsh.client.external` array, or in the shell table → **external**
  (`require("…")` survives).
* `@deepseek-ai/cosmokit` and `@deepseek-ai/schemastery` (vendored framework libs) → **inline**
  (`VENDORED_LIBRARY`, S1:41, S1:219; S3:65-70).
* Wire/type layers `@deepseek-ai/dsh-(host-apiproxy|session|llm|tools|brand)(/…)` (S1:33) and generated
  `…/remote` contributions (S1:44) → **inline**.
* Type-only imports are erased and create no request (S1:220-224).
* Every other `@deepseek-ai/*` **value** import is a build error in the monorepo preset (S1:221-224) and a
  guaranteed runtime throw otherwise (S5 `lib/client.js`:705). Cross-plugin collaboration goes through cordis
  services, never through a shared module import.
* Third-party package names are *not* `@deepseek-ai/*`, so the purity gate never fires for them — but the
  equivalent rule applies by hand: whatever you import must be either a §3.1 key, a specifier you declared in
  `dsh.client.external`, or your own code/ordinary libraries you inline.

### 3.3 `dsh.client.external` — exact match, subpath spelling

* Declaration: `"dsh.client": { "platform": "web", "external": ["…"], "inject": ["…"], "immediately": true }`
  (`platform` is required; the others optional — S5 `lib/index.js`:61-75; `platform !== 'web'` skips the package
  entirely, S5 `lib/index.js`:713-717).
* Matching is **exact, never normalized** (S3:392-406): declare the specifier your code literally imports.
* The canonical subpath form is `<pkg>/client`; the loader strips the suffix so `<pkg>/client` and `<pkg>` are the
  same row (S5 `lib/client.js`:98-100, S5 `lib/index.js`:89-100). Shipped example: two packages declare
  `"external": ["@deepseek-ai/dsh-api-gateway/client"]` (S4 `package.json` of `dsh-api-terminal-controller`,
  `dsh-api-workspace-controller`) and their bundles emit `require("@deepseek-ai/dsh-api-gateway/client")`.
* **[V]** Declaring and importing that spelling works: `.tools\notes\scratch\out-subpath.js:7` emits
  `let _deepseek_ai_dsh_client_locale_client = require("@deepseek-ai/dsh-client-locale/client");`.
* A declared row that is not in the boot graph is rejected at composition (missing supplier / cycle checks,
  S5 `lib/index.js`:415-437); declaring your own package is rejected too (S5 `lib/index.js`:428).

### 3.4 Pitfall list (version drift, all **[R]**)

* **rc.5 preset's table ≠ 0.2.0-rc.2's.** S2:8-15 lists 10 keys including `@deepseek-ai/dsh-client-ui-attachment`,
  `@deepseek-ai/dsh-client-web-react` and `@deepseek-ai/dsh-client-schema-form`. None of those three keys is in
  the 0.2.0-rc.2 shell table, and none of those three packages exists in S4 (the runtime ships no
  `dsh-client-schema-form`, `dsh-client-ui-attachment` or `dsh-client-web-react` directory) — `require`ing one
  throws.
* The rc.5 preset's `RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'` (S1:62-65) is **gone**
  in 0.2.0-rc.2: there is no `dsh-client-runtime` package in S4, and store contracts moved to
  `@deepseek-ai/dsh-client-store`, which *is* a seed row.
* S3:8-13 shows the intermediate rc.8 table (7 keys, plus `PRELOADED_CLIENT_EXTERNALS =
  ['@deepseek-ai/dsh-client-runtime/client']`) — i.e. the table changed twice in three releases.
  **Recipe consequence: read the running shell's `staticModules` builder (or screenshot §3.1) instead of
  trusting any preset revision.** For 0.2.0-rc.2 it is the 9 keys above.
* `react` must stay external: two copies of React in one page is the classic breakage, and the seed path is the
  only place the shell's instance lives. Same for `@deepseek-ai/cordis` (DI identity is per-module-instance).
* `@deepseek-ai/dsh-client-store` / `.../dsh-client-ui-slots` / `.../dsh-client-ui-primitives` /
  `.../dsh-client-ui-dockkit` are statically linked into the shell build — they are **not** separately published
  install-and-load rows in 0.2.0-rc.2 (`dsh-client-store` has no `dsh.client` and no `./client` export at all,
  S4 `dsh-client-store/package.json`). Treat them as seed words only.
* Everything else (`zod`, `clsx`, `zustand`, `immer`, your own deps) must be **inlined** — the shipped
  `dsh-api-remotes` bundle carries a whole zod copy (`//#region ../../../node_modules/.pnpm/zod@4.4.3/…`).

---

## 4. Source maps

* **What the build emits [V]:** with `sourcemap: true`, tsdown writes `lib/client.js.map` and appends the trailer
  `//# sourceMappingURL=client.js.map` as the last non-empty line (see §1.1 tail). The map is
  Source Map v3 with `"file":"client.js"`, relative `sources` (`../src/client/index.ts`) and **`sourcesContent`
  present** (`lib/client.js.map`, first line of the JSON).
* **What the host does [R]:** it strips the bundle's own trailer before combining
  (`SOURCE_MAP_TRAILER`, S5 `lib/index.js`:165, applied at :257), then appends *its own* combo trailer
  (`comboScript`, S5 `lib/index.js`:265-267). Maps are read from exactly `<clientPath>.map`
  (`readFileSync(`${clientPath}.map`)`, S5 `lib/index.js`:273) and validated as
  `version === 3`, `sources`/`names` string arrays, `mappings` string — otherwise
  `client-modules: <path>.map is not a regular Source Map v3 object` (S5 `lib/index.js`:278-281).
* **Not required.** A missing map returns `undefined`, the read is wrapped in a try/catch that logs a warning, and
  the combo map falls back to an *identity section* (`readSourceMap` arrow property, S5 `lib/index.js`:823-831;
  identity fallback at :342-345). Upstream's published artifacts ship **no** maps at all — the `files` arrays of
  the 0.2.0-rc.2 packages list only `lib/client.js`, `lib/client.*.js`, `lib/index.js`, `lib/types/**/*.d.ts`
  (S4 `package.json`), so the shipped `//# sourceMappingURL=client.js.map` trailers are dangling by design.
  The map files are present only in a from-source build.
* **Path resolution caveat [R]:** your map's `sources` are re-based against
  `http://dsh.invalid/plugins/<id>/client.js.map` (S5 `lib/index.js`:289-304), so a relative
  `../src/client/index.ts` becomes a URL under `/plugins/<id>/…` that the host does not serve for third-party
  packages. What actually makes stack frames readable is `sourcesContent` (which tsdown emits) — keep
  `sourcemap: true` for that reason, and set `outputOptions.sourcemapPathTransform` (S1:70-75, :268) only if you
  reproduce the monorepo's `/packages/<group>/<package>/src` URL mirror.
* Chunks get `//# sourceMappingURL=client.<name>.js.map` (bare name, resolved against the chunk's own directory)
  and their maps are read the same way (S5 `README.md`:74; `fetchBundle`/chunk route, S5 `lib/index.js`:949).

---

## 5. Build-order requirements a standalone package must replicate

### 5.1 What the monorepo does **[R]**

`package.json` (root, worktree) scripts:

```
"build:lib:host":   "tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host",
"build:lib:client": "tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client",
"build":            "npm run build:lib && npm run build:web",
```

and the preset selects the client entry by build face: `face === undefined ? 'src/client/index.ts' :
'lib/types/client/index.js'` (S1:101-103; S3:114). Consequences:

1. **tsc runs first**, emitting `lib/types/**/*.js` + `.d.ts` + `.js.map`; tsdown then bundles the *emitted JS*
   (not the TS source) into `lib/client.js`. Type-only imports are already erased at that point.
2. The **node half** (`lib/index.js`, `format: 'esm'`, `platform: 'node'`, `target: 'es2024'`,
   `fixedExtension: false`, `dts: false`, `clean: false`) is emitted by the same package-local config list
   (S1:151-168, S1:98-108). A package-level `tsdown.config.ts` **replaces** the root workspace layout, which is why
   the preset restates the lib half (S1:80-84).
3. Both halves share `outDir: 'lib'` and both set `clean: false` (S1:176-177, 184-185) — the client pass must not
   wipe the node half emitted in the same pass.
4. Root `tsdown.config.ts` runs a workspace build (`workspace: ['vendor/*','packages/*/*','apps/cli']`) and
   disables the typert plugin on the client pass; a standalone package needs none of it.

### 5.2 What a standalone package must do

* Run the type emit **before** the bundle if you want `lib/types/**/*.d.ts` (the `types`/`exports.types` paths in
  your `package.json`) — e.g. `tsc -p tsconfig.client.json && tsdown`, or simply point `entry` at
  `src/client/index.ts` and let tsdown strip types (verified working, §2.2) while shipping no `lib/types`
  (then drop the `types` conditions from `exports`).
* Emit the host half too. Every shipped package pairs `lib/client.js` with an ESM `lib/index.js` that at minimum
  exports `apply` — compare `.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-files\lib\index.js` (6 lines:
  `function apply() {}` / `export { apply };`); richer example:
  `.tools\runtime-0.2.0-rc.2\dsh-client-ui-sidebar-documentpreview\lib\index.js` (ESM, `export { Config, apply }`).
  The Loader entry is the package specifier, and the client-modules scan skips entries whose fiber is missing
  (`entry.fiber === void 0`, S5 `lib/index.js`:836) — so **[I]** an unimportable host half means no active entry
  and therefore no browser row for that package.
* **Runtime prerequisites [R]:** `dsh.client.platform === 'web'` (else the package is skipped,
  S5 `lib/index.js`:713-717) and `exports["./client"]` resolving to the built file (string or `{default}` —
  S5 `lib/index.js`:171-180; missing → `client-modules: <pkg> declares dsh.client but exports no "./client" bundle`,
  :719). `main`/`exports.types` per S4 packages are a good template.
* **If the bundle is missing, activation fails loudly [R]** — exact text, S5 `lib/index.js`:128-142:

```
client-modules: client bundle not found; run `pnpm run build` before launch:
  package: <name>
  path: <abs path>
```
  aggregated as `client-modules: N client packages failed to compose:` with a `- package:`/`path:` list
  (S5 `lib/index.js`:143-157). The bundle bytes are read at activation and re-read on HMR via `rebuilt(id)`
  (S5 `lib/index.js`:794-821, 607-625), so the file must exist **before** the host starts.

### 5.3 The stamp step (chunks) — partially unverified

S5 `README.md`:74 **[R]**: "The shared preset stamps `client.js` after every package output is written, so a
chunk-only rebuild changes the owner revision without a Host-side chunk scan."

* Revisions are computed from `mtimeMs`, `ctimeMs`, `size` only — never content hashes
  (S5 `lib/index.js`:192-195, 794-803). An unchanged triple keeps the same `rev`.
* I could not find that stamp in either readable preset revision (S1; S3 — no `writeBundle`/`closeBundle`/
  `utimes` hook), so the *implementation* is **[I]**, but its purpose is stated by the runtime's own README and
  the failure mode follows from the code: the chunk URL embeds the owner's rev
  (`chunkUrl`, S5 `lib/client.js`:479-486) and chunk responses are served `public, max-age=31536000, immutable`
  (S5 `lib/index.js`:159). A chunk-only rebuild that leaves `lib/client.js`'s metadata untouched therefore keeps
  the old URL, and the browser answers from its immutable cache with the **old chunk bytes**.
* **Recipe consequence:** if you emit `client.*.js` chunks, touch/rewrite `lib/client.js` (e.g.
  `fs.utimesSync(path, now, now)`) after the chunk outputs are written, or accept a full page reload.

---

## 6. Fallback recipe (if the wrapper cannot be produced by the bundler)

The wrapper **is** reproducible with plain tsdown 0.22.2 **[V]**, so this path is only for a different bundler,
an older tsdown that ignores/rejects `intro`, or a bundled tool that mangles top-level statements. Minimum viable
post-processing (one Node script, no bundler plugins):

```js
// scripts/wrap-client-bundle.mjs  — banner + raw CJS body + footer + trailer
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const [bodyPath, id] = process.argv.slice(2)          // e.g. lib/client.raw.cjs  <pkg name>
const body = readFileSync(bodyPath, 'utf8')
if (/^\s*(import|export)\s/m.test(body)) throw new Error('body must be CJS output, not ESM')

const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\n`
  + 'var module = { exports: {} }; var exports = module.exports;\n'
const footer = 'return module.exports; } });\n'
const out = banner + body + footer + '//# sourceMappingURL=client.js.map\n'
writeFileSync(new URL('../lib/client.js', import.meta.url), out)

// The map must be shifted by exactly the banner's line count (Source Map v3 `mappings` is line-relative:
// one extra generated line = one extra leading ';').
const mapPath = bodyPath + '.map'
if (existsSync(mapPath)) {
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  const addedLines = (banner.match(/\n/g) ?? []).length
  map.mappings = ';'.repeat(addedLines) + map.mappings
  map.file = 'client.js'
  writeFileSync(new URL('../lib/client.js.map', import.meta.url), JSON.stringify(map))
}
```

Notes: (a) the body must already be a CJS bundle ending in `exports.<name> = …` assignments
(`format: 'cjs'`, `platform: 'browser'`, same `deps`/`define` rules as §2); (b) the offset fix above is **[I]** —
standard Source Map v3 semantics, not exercised here, because the native path handles offsets itself
(**[V]**: tsdown's own map starts with `;;;;;;;;;;;;;;;;;;;;;` to account for the wrapper lines);
(c) run the §7 validator afterwards — it is the acceptance test for either path.

---

## 7. Acceptance test (used to verify everything above)

`.tools\notes\scratch\verify-client-bundle.mjs` **[V]** — checks, in order: wrapper opens the file (after
rolldown's hoisted legal comments), `id:` equals the package name, `chunk:` for `client.*.js` files,
`factory: (require) => {`, the `var module`/`var exports` prologue, `return module.exports;`, a `});` close, the
`//# sourceMappingURL=` trailer as last non-empty line, `<bundle>.map` existing next to it, no surviving top-level
ESM, and (with `--externals a,b,c`) every `require("…")` specifier being in the table/your declaration list.

```
node verify-client-bundle.mjs lib/client.js '@demo/dsh-client-demo' --externals react,react/jsx-runtime,react-dom,react-dom/client,@deepseek-ai/cordis,@deepseek-ai/dsh-client-store,@deepseek-ai/dsh-client-ui-slots,@deepseek-ai/dsh-client-ui-primitives,@deepseek-ai/dsh-client-ui-dockkit
node verify-client-bundle.mjs lib/client.big.js '@demo/dsh-client-demo'
```

Results on this machine: **PASS** for the scratch bundle and its chunk; the *shipped* 0.2.0-rc.2 bundles
(`dsh-client-ui-sidebar-files/lib/client.js`, `…sidebar-documentpreview/lib/client.excel.js`) pass every structural
check and fail only the `<bundle>.map exists` check — expected, since the published packages exclude maps (§4).

---

## 8. Residual uncertainty

1. **The 0.2.0-rc.2 preset source was not readable.** The shared preset is repo-local and unpublished
   (`dsh-client-modules/README.md`:50-51 explains the host consumes built bundles). S1 (rc.5) and S3 (rc.8) are
   older than the runtime; all *contract* claims above were therefore re-verified against the shipped artifacts
   (S4) and the built shell (S6) rather than the preset. Anything about the preset's internals that the artifacts
   cannot show (the chunk-stamp hook, the exact present-day `clientExternals` union) is marked [I].
2. **`dsh.client.inject` semantics were only read, not exercised.** It feeds `WebBootEntry.inject` and orders
   dependency rows before consumers (S5 `lib/index.js`:415-437, :656-659); a wrong list is reported as a
   dependency-cascade import failure, not as a build error.
3. **HMR specifics were not exercised.** `rebuilt(id)`/`invalidate` behaviour and the immutable-cache consequence
   in §5.3 are read from code and README, not reproduced with a live HMR cycle.
4. **The shell table was read from the installed build, not from a source file for 0.2.0-rc.2.** If a future
   release ships a different `rM()`, the 9-key list drifts; the *procedure* (read the seed builder in
   `dsh-web-frontend/dist/assets/index-*.js`, or `packages/client/web/src/seed.ts` in-source) is the durable part.
5. **`dts: true` was not tested.** The claim "dts would wrap the banner/footer into `.d.cts` and break parsing"
   is quoted from S1:180; the observed behaviour with `dts: false` (no `.d.cts` emitted, `lib/client.js` clean) is
   verified.
6. **The exact tsdown option surface may differ on other 0.22.x minors.** Everything in §2.4 was verified only on
   tsdown 0.22.2 + rolldown 1.1.5.
7. **Non-Windows/other-Node behaviour** (path separators inside the CSS virtual id, `\0` handling) was exercised
   only on Windows 22.22.2. The upstream preset's `sourceAssetPath` has an extra `lib/types` → `src` rewrite
   (S1:276-284) that the scratch copy omitted because the scratch entry lived under `src/`.
