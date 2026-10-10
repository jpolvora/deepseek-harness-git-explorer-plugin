/**
 * Client build: emits `lib/client.js` in the shape the Web client loads — a CJS
 * closure factory registered with the page's module loader:
 *
 *   window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => { … } })
 *
 * Load-bearing details (verified against the shipped 0.2.0-rc.2 bundles):
 *  - `id` must be the bare package name; the loader keys every browser row by it.
 *  - `intro` declares the `module`/`exports` pair the CJS body writes to; without it
 *    the bundle fails at materialization with "exports is not defined".
 *  - `entryFileNames` must stay `client.js`: the package is `"type": "module"`, so a
 *    CJS build otherwise emits `client.cjs`, which no URL convention resolves.
 *  - `footer` returns the exports object; the loader stores the factory's *return
 *    value* as the module's exports.
 *  - `require` resolves the page's frozen module table, so those requests must never
 *    be bundled. Everything else under `@deepseek-ai/` is a shared row for the same
 *    reason.
 */
import { defineConfig } from 'tsdown'

const PACKAGE_NAME = '@jpolv/dsh-git-explorer'

/** The page's frozen module table in the running 0.2.0-rc.2 client. */
const FROZEN_MODULE_TABLE = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

export default defineConfig({
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  // The host reads `<clientPath>.map` beside the bundle; a missing or invalid map is
  // only a warning there, but shipping one keeps the artifact shape the loader expects.
  sourcemap: true,
  deps: {
    neverBundle: (id) => FROZEN_MODULE_TABLE.has(id) || id.startsWith('@deepseek-ai/'),
    // The package's own generated Remote projection must be inlined: it is not a
    // platform module, and the page has no other way to obtain its schemas. `zod`
    // comes with it (the shipped remote assembly inlines it the same way).
    alwaysBundle: [/^@jpolv\/dsh-git-explorer(\/|$)/, 'zod'],
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: '\t\treturn module.exports;\n\t}\n});\n',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
