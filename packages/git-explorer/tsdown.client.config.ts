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
 *  - `*.module.css` is compiled by the plugin below: the page loads one JavaScript
 *    artifact per plugin, so a stylesheet has to travel inside it. The plugin lives in
 *    this file because tsdown's config loader does not resolve a relative `.ts` import.
 */
import { existsSync, readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

/**
 * The **installed** package name — the published root package, which is what the profile
 * records, what the bundle patch names as a row and therefore what the loader keys the
 * browser row by. It is deliberately not this build package's own name: the build package
 * is private, and only its generated Remote ids carry that name.
 */
const PACKAGE_NAME = 'dsh-plugin-git-explorer'

/** The directory the client sources are compiled from, for per-stylesheet tag ids. */
const packageRoot = fileURLToPath(new URL('.', import.meta.url))

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

/** The virtual-id prefix that keeps module CSS away from the bundler's CSS pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'

/**
 * The virtual-id suffix. It must NOT be `.css`: tsdown's own guard claims those ids and
 * fails the build with "'@tsdown/css' is not installed".
 */
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Compile one stylesheet into a module carrying its class map and its own style tag.
 *
 * @param filename - the stylesheet's absolute path, used for hashing and diagnostics.
 * @param source - the stylesheet's text.
 * @returns the module source.
 */
function emitCssModule(filename: string, source: string): string {
  const compiled = transform({
    filename,
    code: Buffer.from(source),
    cssModules: true,
    minify: false,
    sourceMap: false,
  })
  const classes: Record<string, string> = {}
  for (const [original, entry] of Object.entries(compiled.exports)) classes[original] = entry.name
  // Every stylesheet gets its OWN tag, keyed by its path: one shared tag meant the last
  // sheet to materialize overwrote the others, which showed up as a completely unstyled
  // panel. `data-plugin` stays the package name so the loader can evict plugin CSS.
  const tagId = `${PACKAGE_NAME}/${relative(packageRoot, filename).split(sep).join('/')}`
  return [
    `const css = ${JSON.stringify(compiled.code.toString())};`,
    `const classes = ${JSON.stringify(classes)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== "undefined") {',
    '  let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");',
    '  if (tag === null) {',
    '    tag = document.createElement("style");',
    `    tag.dataset.plugin = ${JSON.stringify(PACKAGE_NAME)};`,
    '    tag.dataset.pluginCss = tagId;',
    '    document.head.appendChild(tag);',
    '  }',
    '  if (tag.textContent !== css) tag.textContent = css;',
    '}',
    'export default classes;',
    '',
  ].join('\n')
}

/**
 * The CSS Modules plugin for this bundle.
 *
 * The importer is the *compiled* JavaScript under `lib/types/`, while the stylesheets
 * live beside the sources: this repository mirrors `lib/types/**` from `src/**`, so the
 * path is mapped back before it is read. A stylesheet that really does sit next to the
 * compiled output is still found, because the original path is tried too.
 *
 * @returns a rolldown-compatible plugin.
 */
function cssModules() {
  return {
    name: 'dsh-css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const absolute = importer === undefined
        ? source
        : fileURLToPath(new URL(source, pathToFileURL(importer)))
      const fromSource = absolute
        .replace(`${sep}lib${sep}types${sep}`, `${sep}src${sep}`)
        .replaceAll('/', sep)
      const resolved = existsSync(fromSource) ? fromSource : absolute
      return `${CSS_VIRTUAL_PREFIX}${resolved}${CSS_VIRTUAL_SUFFIX}`
    },
    load(id: string) {
      if (!id.startsWith(CSS_VIRTUAL_PREFIX) || !id.endsWith(CSS_VIRTUAL_SUFFIX)) return null
      const filename = id.slice(CSS_VIRTUAL_PREFIX.length, id.length - CSS_VIRTUAL_SUFFIX.length)
      return emitCssModule(filename, readFileSync(filename, 'utf8'))
    },
  }
}

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
  plugins: [cssModules()],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: '\t\treturn module.exports;\n\t}\n});\n',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
