/**
 * Real-data validation: decode an actual zstd session log (multi-frame zstd
 * concatenation, one frame per durable append batch, each followed by a
 * checksum), reconstruct the events, and run the plugin's fold against them.
 *
 * Frame boundaries are found by walking the zstd block chain (RFC 8878):
 * magic + Frame_Header_Descriptor + window descriptor (+FCS) then 3-byte
 * block headers until the last block; a trailing 4-byte checksum is detected
 * by probing for the next frame's magic.
 *
 * Run: node test/real-data-check.mjs <session.jsonl.zstd>
 */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UsageStore } from '../src/store.js'
import { foldEvents } from '../src/fold.js'
import { summarize } from '../src/aggregate.js'

const file = process.argv[2]
if (!file) {
  console.error('usage: node test/real-data-check.mjs <session.jsonl.zstd>')
  process.exit(1)
}

const buffer = readFileSync(file)
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Byte offset just past the last block of the frame starting at `start`. */
function frameDataEnd(buf, start) {
  const d = buf[start + 4]
  const singleSegment = (d >> 5) & 1
  const fcsFlag = d >> 6
  let pos = start + 5
  if (!singleSegment) pos += 1 // window descriptor byte
  if (fcsFlag === 0 && singleSegment) pos += 1
  else if (fcsFlag === 1) pos += 2
  else if (fcsFlag === 2) pos += 4
  else if (fcsFlag === 3) pos += 8
  for (;;) {
    const bh = buf.readUIntLE(pos, 3)
    const last = bh & 1
    const type = (bh >> 1) & 3
    const size = bh >> 3
    pos += 3
    pos += type === 1 ? 1 : size // RLE payloads are one byte
    if (last) return pos
  }
}

/** Split the buffer into complete frames (checksum stripped). */
function splitFrames(buf) {
  const frames = []
  let offset = 0
  while (offset < buf.length) {
    if (!buf.subarray(offset, offset + 4).equals(MAGIC)) {
      throw new Error(`no frame magic at byte ${offset}`)
    }
    const end = frameDataEnd(buf, offset)
    // Detect a trailing 4-byte checksum: next frame magic right after, or checksum + magic.
    const hasChecksum =
      buf.subarray(end + 4, end + 8).equals(MAGIC) || end + 4 === buf.length
    frames.push(buf.subarray(offset, hasChecksum ? end + 4 : end))
    offset = hasChecksum ? end + 4 : end
  }
  return frames
}

const frames = splitFrames(buffer)
console.log(`frames: ${frames.length}`)

const lines = []
for (const frame of frames) {
  const text = zstdDecompressSync(frame).toString('utf8')
  for (const line of text.split('\n')) {
    if (line.trim() !== '') lines.push(line)
  }
}
console.log(`logical lines: ${lines.length}`)

const events = []
let header = null
let packed = 0
let malformed = 0
for (const line of lines) {
  try {
    const record = JSON.parse(line)
    if (record.type === 'session') {
      header = record
      continue
    }
    if (typeof record.type === 'string') events.push(record)
    else packed += 1
  } catch {
    malformed += 1
  }
}
console.log(`header: ${header?.id ?? 'MISSING'} created ${new Date(header?.createdAt ?? 0).toISOString()}`)
console.log(`events: ${events.length}, packed rows: ${packed}, malformed: ${malformed}`)
events.sort((a, b) => a.seq - b.seq)

// Run the plugin's own fold over the real events.
const dir = mkdtempSync(join(tmpdir(), 'usage-heatmap-real-'))
const store = new UsageStore({ dir, log: () => {} })
store.load()
const added = foldEvents(store, String(header.id), events)
console.log(`folded usage rows: ${added}`)

if (added > 0) {
  const summary = summarize(store.all(), 365, [])
  console.log('summary (365d):')
  console.log(JSON.stringify(summary.totals, null, 2))
  console.log('models:', summary.models.map(m => `${m.model}: ${m.requests} req`).join(', '))
  console.log('REAL DATA FOLD OK')
} else {
  console.log('no usage rows in this session (older logs or no provider usage) — fold still ran cleanly')
}
store.dispose()
rmSync(dir, { recursive: true, force: true })
