/**
 * Historical backfill: fold every session log through the shared watermark, so
 * usage recorded before this plugin existed (or while it was unloaded) lands in
 * the store. Uses `sessionQuery` — the live-preferred read path — so backfill
 * never rewrites or repairs session logs.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { foldEvents } from './fold.js'
import type { UsageStore } from './store.js'

/**
 * Fold all sessions once. Sessions whose watermark already covers their log are
 * skipped without I/O cost beyond the corpus listing.
 * @param ctx - cordis context with `sessionQuery` mounted.
 * @param store - the usage store.
 * @param log - diagnostics sink.
 * @returns the number of usage rows added.
 */
export async function runBackfill(
  ctx: Context,
  store: UsageStore,
  log: (message: string) => void,
): Promise<number> {
  const query = ctx.sessionQuery as SessionQueryEngine | undefined
  if (query === undefined) return 0
  let added = 0
  let read = 0
  try {
    const records = await query.listSessions()
    for (const record of records) {
      const id = String(record.header.id)
      try {
        // The corpus prefers a live in-memory snapshot and falls back to the
        // durable log, so one read covers both active and cold sessions.
        const { events } = await query.readSession(record.header.id)
        read += 1
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
  log(`usage backfill: read ${read} session(s), added ${added} row(s)`)
  return added
}
