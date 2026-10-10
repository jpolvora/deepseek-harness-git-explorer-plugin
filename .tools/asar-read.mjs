// Minimal read-only ASAR reader: list or print entries from an .asar archive.
// Usage:
//   node asar-read.mjs <archive> list [prefix]
//   node asar-read.mjs <archive> cat <entryPath>
import { openSync, readSync, closeSync } from 'node:fs'

const [archive, cmd, arg] = process.argv.slice(2)
if (!archive || !cmd) {
  console.error('usage: node asar-read.mjs <archive> list [prefix] | cat <entryPath>')
  process.exit(2)
}

const fd = openSync(archive, 'r')
try {
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(12)
  const jsonBuf = Buffer.alloc(headerSize)
  readSync(fd, jsonBuf, 0, headerSize, 16)
  const header = JSON.parse(jsonBuf.toString('utf8').replace(/\0+$/, ''))
  const dataOffset = 16 + headerSize

  const walk = (node, prefix) => {
    if (node.files) {
      for (const [name, child] of Object.entries(node.files)) walk(child, `${prefix}/${name}`)
    } else {
      console.log(`${prefix}\t${node.size ?? 0}\t${node.offset ?? ''}`)
    }
  }

  if (cmd === 'list') {
    const prefix = arg ?? ''
    const start = prefix ? prefix.split('/').filter(Boolean).reduce((n, k) => n?.files?.[k], header) : header
    if (!start) {
      console.error(`no such prefix: ${prefix}`)
      process.exit(1)
    }
    walk(start, prefix)
  } else if (cmd === 'cat') {
    const entry = arg.split('/').filter(Boolean).reduce((n, k) => n?.files?.[k], header)
    if (!entry || entry.files) {
      console.error(`not a file: ${arg}`)
      process.exit(1)
    }
    const buf = Buffer.alloc(entry.size)
    readSync(fd, buf, 0, entry.size, dataOffset + Number(entry.offset))
    process.stdout.write(buf)
  } else {
    console.error(`unknown command: ${cmd}`)
    process.exit(2)
  }
} finally {
  closeSync(fd)
}
