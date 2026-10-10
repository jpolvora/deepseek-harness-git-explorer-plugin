/**
 * One-off: load the built client bundle in jsdom, apply the client plugin with stub
 * services, render the panel body, and report whether the stylesheet arrived and whether
 * the elements carry hashed class names.
 * Usage (from the package directory): node scripts/probe-bundle.mjs
 */
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
})

const { window } = dom
const loaded = new Map()

/** The shim the bundle's factory receives: React from the store, DSH packages stubbed. */
function factoryRequire(id) {
  if (id === 'react') return require('react')
  if (id === 'react/jsx-runtime') return require('react/jsx-runtime')
  if (id === 'react-dom') return require('react-dom')
  if (id === '@deepseek-ai/cordis') return { Context: class {} }
  return new Proxy({}, { get: (_target, key) => (key === '__esModule' ? true : () => null) })
}

window.__ModuleLoader__ = {
  load({ id, factory }) {
    const module = { exports: {} }
    const exports = factory(factoryRequire)
    loaded.set(id, exports ?? module.exports)
  },
}

// Evaluate the bundle inside the jsdom window.
const code = readFileSync('lib/client.js', 'utf8')
const { runInContext } = await import('node:vm')
runInContext(code, dom.getInternalVMContext())

console.log(`rows registered with the loader: ${[...loaded.keys()].join(', ') || '(none)'}`)

const client = loaded.get('dsh-plugin-git-explorer')
console.log(`client entry: ${client === undefined ? 'MISSING' : Object.keys(client).join(', ')}`)

// Apply the plugin with stub services, capturing what it registers.
const tabTypes = new Map()
const slotRegistrations = []
const ctx = {
  effect: (run) => { run(); return () => undefined },
  inject: (deps, callback) => { callback(ctx); return () => undefined },
  get: (name) => (name === 'remote' ? { $mount: async () => async () => undefined } : undefined),
  remote: { $mount: async () => async () => undefined },
  slots: {
    inject: (_key, callback) => { callback(); return () => undefined },
    register: (spec, component) => { slotRegistrations.push({ slot: spec.name, key: spec.key, component }); return () => undefined },
  },
  sidebarRightTabs: { register: (spec) => { tabTypes.set(spec.kind, spec); return () => undefined } },
  sidebarRight: { openTab: () => undefined },
  locale: { register: () => () => undefined },
}

await client.apply(ctx)
console.log(`tab types: ${[...tabTypes.keys()].join(', ')}`)
console.log(`slot registrations: ${slotRegistrations.map((entry) => `${entry.slot}#${entry.key}`).join(', ')}`)

const styles = [...window.document.head.querySelectorAll('style')]
console.log(`style tags in head: ${String(styles.length)}`)
for (const tag of styles) {
  const css = tag.textContent ?? ''
  console.log(`  data-plugin=${tag.getAttribute('data-plugin') ?? '-'} data-plugin-css=${tag.getAttribute('data-plugin-css') ?? '-'} bytes=${String(css.length)} hashed=${String(/\._[A-Za-z0-9]+_/.test(css))}`)
}

// Render the panel body, which is where the class names become visible.
globalThis.window = window
globalThis.document = window.document
const React = require('react')
const { createRoot } = require('react-dom/client')
const registration = slotRegistrations.find((entry) => entry.slot === 'sidebar.right.pane.tab' && entry.key === 'dsh-plugin-git-explorer')
const Body = registration?.component
if (Body === undefined) {
  console.log('panel body was not registered')
} else {
  const root = createRoot(window.document.getElementById('root'))
  root.render(React.createElement(Body, {
    sessionId: 'session-1',
    gitStatus: async () => ({
      isRepo: true, root: 'L:\\demo', rootSource: 'request', gitVersion: 'git version 1', operation: null,
      branch: 'main', detached: false, unborn: false, upstream: null, ahead: 0, behind: 0,
      staged: [], unstaged: [{ path: 'a.ts', status: 'modified', index: '.', worktree: 'M', staged: false }],
      untracked: [], conflicted: [], truncated: false, skipped: [], note: '',
    }),
  }))
  await new Promise((resolve) => setTimeout(resolve, 60))
  const html = window.document.getElementById('root').innerHTML
  const classNames = [...html.matchAll(/class="([^"]+)"/g)].map((match) => match[1])
  console.log(`rendered bytes: ${String(html.length)}`)
  console.log(`class attributes: ${classNames.slice(0, 6).join(' | ') || '(none)'}`)
  // Every class the panel renders must be defined in its own sheet: a hash mismatch would
  // style nothing while still looking correct in the source.
  const panelSheet = styles
    .map((tag) => tag.textContent ?? '')
    .find((css) => css.includes('.') && css.includes('panelHeader')) ?? ''
  const matched = classNames.filter((value) => panelSheet.includes(value))
  console.log(`classes defined in the panel sheet: ${String(matched.length)} of ${String(classNames.length)}`)
}
