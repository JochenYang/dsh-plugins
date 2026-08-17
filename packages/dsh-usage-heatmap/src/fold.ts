/**
 * Event folding shared by the live firehose and the persisted-log backfill.
 *
 * The single authoritative source of usage data is the session event log:
 * every `assistant/message` event carries the step's `TokenUsage` when the
 * adapter reported accounting, and the assistant message's source records the
 * provider/model route. Both channels fold through the same per-session
 * watermark, so overlaps are deduplicated by `(sessionId, seq)`.
 */

import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { UsageRow, UsageStore } from './store.js'

/**
 * Fold one batch of session events into usage rows, skipping everything at or
 * below the store's watermark for the session. The watermark is advanced for
 * the WHOLE batch (last seen seq), not only for rows produced.
 * @param store - the usage store (watermark + row sink).
 * @param sessionId - the session the events belong to.
 * @param events - chronological session events.
 * @returns the rows added (already persisted by the store).
 */
export function foldEvents(store: UsageStore, sessionId: string, events: readonly SessionEvent[]): number {
  if (events.length === 0) return 0
  const fromSeq = store.watermark(sessionId)
  const rows: UsageRow[] = []
  let provider = ''
  let model = ''
  for (const event of events) {
    if (event.seq <= fromSeq) continue
    if (event.type === 'request/header') {
      // Defense for logs whose assistant messages lack source provenance.
      provider = event.data.header.config.provider
      model = event.data.header.config.model
    } else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
      const source = event.data.message.source
      const usage = event.data.usage
      rows.push({
        seq: event.seq,
        time: event.time,
        sessionId,
        turn: event.data.turn,
        step: event.data.step,
        provider: source.kind === 'model' && source.provider !== '' ? source.provider : provider,
        model: source.kind === 'model' && source.model !== '' ? source.model : model,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0,
      })
    }
  }
  const lastSeq = events[events.length - 1].seq
  store.advanceWatermark(sessionId, lastSeq)
  return store.addRows(rows)
}

/** Fold ONE live firehose event (the store deduplicates overlaps with backfill). */
export function foldLiveEvent(store: UsageStore, session: Session, event: SessionEvent): void {
  foldEvents(store, String(session.id), [event])
}
