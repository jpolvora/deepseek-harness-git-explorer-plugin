/**
 * Diagnostic probe: run the Typert workspace generator exactly as the tsdown plugin
 * does (package mode, host face) and print what it discovers and emits.
 *
 * Usage: node scripts/probe-typert.mjs [face]
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const faces = [process.argv[2] ?? 'host']

console.log('workspace root:', root)
console.log('faces:', faces.join(', '))

const generator = new WorkspaceTypertGenerator(root, { checkDiagnostics: false })
try {
  const discovered = generator.discover(faces)
  console.log('discovered packages:', JSON.stringify(discovered, null, 2))
} catch (error) {
  console.log('discover() threw:', error instanceof Error ? error.message : String(error))
}

try {
  const artifacts = generator.generate(undefined, faces)
  console.log('artifacts:', JSON.stringify(artifacts.map((artifact) => ({
    package: artifact.package,
    face: artifact.face,
    packageRoot: artifact.packageRoot,
    hasRemote: artifact.remote !== undefined,
    jsBytes: artifact.js?.length ?? 0,
  })), null, 2))
} catch (error) {
  console.log('generate() threw:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  if (error instanceof Error && error.stack !== undefined) console.log(error.stack.split('\n').slice(0, 12).join('\n'))
}
