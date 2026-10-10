/**
 * Host build: tsc emits `lib/types/**` (the Typert generator consumes that output),
 * then tsdown bundles the package entry to `lib/index.js` and the Typert tsdown
 * plugin emits `lib/typert.host.js` plus the client projection
 * `lib/typert.remote-client.js` at the package output root.
 *
 * `mode: 'package'` is the standalone-repository mode: only the package being
 * bundled is emitted, instead of a whole workspace contributor pass.
 */
import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  // Runtime singletons stay external so the profile's copies are the ones loaded:
  // a bundled second Cordis or Typert protocol instance would break identity checks.
  deps: {
    neverBundle: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/schemastery',
      'zod',
    ],
  },
  plugins: [typertPlugin({ mode: 'package', faces: ['host'] })],
})
