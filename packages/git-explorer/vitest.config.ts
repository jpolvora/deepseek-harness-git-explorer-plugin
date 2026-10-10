/**
 * Vitest configuration.
 *
 * The only aliasing is the primitives stand-in: at runtime the browser resolves those
 * modules from the page's frozen module table, which the test environment does not have.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': resolve(here, 'tests/support/primitives-stub.tsx'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
