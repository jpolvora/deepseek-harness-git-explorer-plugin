// Extract entries from an ASAR archive to a local directory (read-only wrt the archive).
// Usage: node asar-extract.mjs <archive> <entryPathPrefix>... --out <dir>
import { openSync, readSync, closeSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'


const argv = process.argv.slice(2)
const outIdx = argv.indexOf('--out')
const archive = argv[0]
const outDir = argv[outIdx + 1]
const prefixes = argv.slice(1, outIdx)

const fd = openSync(archive, 'r')
try {
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(12)
  const jsonBuf = Buffer.alloc(headerSize)
  readSync(fd, jsonBuf, 0, headerSize, 16)
  const header = JSON.parse(jsonBuf.toString('utf8').replace(/\0+$/, ''))
  const dataOffset = 16 + headerSize

  let count = 0
  let bytes = 0
  for (const prefix of prefixes) {
    const node = prefix.split('/').filter(Boolean).reduce((n, k) => n?.files?.[k], header)
    if (!node) {
      console.error(`missing prefix: ${prefix}`)
      continue
    }
    const walk = (n, rel) => {
      if (n.files) {
        for (const [name, child] of Object.entries(n.files)) walk(child, posix.join(rel, name))
        return
      }
      const target = join(outDir, rel)
      mkdirSync(dirname(target), { recursive: true })
      const buf = Buffer.alloc(n.size)
      readSync(fd, buf, 0, n.size, dataOffset + Number(n.offset))
      writeFileSync(target, buf)
      count += 1
      bytes += n.size
    }
    walk(node, posix.basename(prefix))
  }
  console.error(`extracted ${count} files, ${(bytes / 1048576).toFixed(1)} MiB`)
} finally {
  closeSync(fd)
}
