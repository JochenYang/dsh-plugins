/**
 * Historical backfill: fold every persisted session log through the shared
 * watermark, so usage recorded before this plugin existed (or while it was
 * unloaded) lands in the store. Uses `sessionPersistence.inspect()` — the
 * non-mutating read path — so backfill never rewrites or repairs session logs.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { foldEvents } from './fold.js'
import type { UsageStore } from './store.js'

/**
 * Fold all persisted sessions once. Sessions whose watermark already covers
 * their log are skipped without I/O cost beyond the header listing.
 * @param ctx - cordis context with `sessionPersistence` mounted.
 * @param store - the usage store.
 * @param log - diagnostics sink.
 * @returns the number of usage rows added.
 */
export async function runBackfill(
  ctx: Context,
  store: UsageStore,
  log: (message: string) => void,
): Promise<number> {
  const persistence = ctx.sessionPersistence as SessionPersistence | undefined
  if (persistence === undefined) return 0
  let added = 0
  let inspected = 0
  try {
    const headers = await persistence.list()
    for (const header of headers) {
      const id = String(header.id)
      try {
        // A live session's inspect() returns its in-memory snapshot; a cold
        // session's returns the durable log. Both are frozen and balanced.
        const { events } = await persistence.inspect(header.id)
        inspected += 1
        const from = store.watermark(id)
        const lastSeq = events.length > 0 ? events[events.length - 1].seq : 0
        if (lastSeq <= from) continue
        added += foldEvents(store, id, events)
      } catch (error) {
        log(`usage backfill: session ${id} skipped: ${(error as Error).message}`)
      }
    }
  } catch (error) {
    log(`usage backfill: listing failed: ${(error as Error).message}`)
  }
  log(`usage backfill: inspected ${inspected} session(s), added ${added} row(s)`)
  return added
}
