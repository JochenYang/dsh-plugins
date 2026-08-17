/**
 * Smoke test: exercise the usage pipeline (store → fold → aggregate → routes)
 * against synthetic session events, with a fake webserver and mock HTTP
 * request/response objects. Runtime `@deepseek-ai/*` imports are type-only in
 * the modules under test, so the esbuild bundle runs with no host present.
 *
 * Build: esbuild test/smoke.entry.ts --bundle --platform=node --format=esm
 *        --outfile=test/smoke.mjs
 * Run:   node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UsageStore } from '../src/store.js'
import { foldEvents } from '../src/fold.js'
import { summarize, heatmap, rawRows, localDateKey, startOfLocalDay } from '../src/aggregate.js'
import { registerUsageRoutes } from '../src/routes.js'
import type { UsageRow } from '../src/store.js'

const DAY = 86_400_000

/** Minimal fake session event. */
function event(seq: number, time: number, type: string, data: unknown) {
  return { seq, time, type, data } as never
}

function assistantMessage(seq: number, time: number, turn: number, step: number, usage: unknown) {
  return event(seq, time, 'assistant/message', {
    turn,
    step,
    message: { source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' } },
    usage,
  })
}

function headerEvent(seq: number, time: number, provider: string, model: string) {
  return event(seq, time, 'request/header', { header: { config: { provider, model } } })
}

function rowOf(rows: readonly UsageRow[], i: number): UsageRow {
  return rows[i]
}

// ---------------------------------------------------------------------------
// 1. fold + store: live-style single events and backfill-style batches
// ---------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'usage-heatmap-smoke-'))
  const store = new UsageStore({ dir, log: () => {} })
  store.load()
  const sessionId = 'session-1'
  const now = Date.now()

  // Batch 1 (backfill): header + two assistant messages with usage.
  const batch1 = [
    headerEvent(0, now - DAY, 'deepseek', 'deepseek-chat'),
    assistantMessage(1, now - DAY, 1, 0, { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200, cacheWriteTokens: 10, reasoningTokens: 5 }),
    assistantMessage(2, now - DAY, 1, 1, { inputTokens: 30, outputTokens: 20 }),
  ]
  assert.equal(foldEvents(store, sessionId, batch1), 2, 'backfill adds both usage rows')
  assert.equal(store.watermark(sessionId), 2, 'watermark advances to last seq')
  const r1 = rowOf(store.all(), 0)
  assert.equal(r1.cacheReadTokens, 200)
  assert.equal(r1.provider, 'deepseek')
  assert.equal(r1.model, 'deepseek-chat')

  // Replaying the same batch must add nothing (idempotent).
  assert.equal(foldEvents(store, sessionId, batch1), 0, 'replay is a no-op')

  // A later live event after a restart-with-reload scenario.
  const live = [assistantMessage(3, now, 2, 0, { inputTokens: 7, outputTokens: 3, cacheReadTokens: 5 })]
  assert.equal(foldEvents(store, sessionId, live), 1, 'live event adds one row')

  // A new session with only a header (no usage) must still advance the watermark.
  const emptySession = 'session-empty'
  foldEvents(store, emptySession, [headerEvent(0, now, 'deepseek', 'deepseek-reasoner')])
  assert.equal(store.watermark(emptySession), 0, 'header-only session advances watermark')
  assert.equal(store.size, 3, 'three rows total')
  store.dispose()
  rmSync(dir, { recursive: true, force: true })
  console.log('1. fold + store OK')
}

// ---------------------------------------------------------------------------
// 2. aggregate: totals, models, daily, pricing, cache hit rate
// ---------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'usage-heatmap-smoke-'))
  const store = new UsageStore({ dir, log: () => {} })
  store.load()
  const now = Date.now()
  const today = startOfLocalDay(now)
  const rows: UsageRow[] = [
    { seq: 1, time: today, sessionId: 's1', turn: 1, step: 0, provider: 'deepseek', model: 'deepseek-chat', inputTokens: 100, outputTokens: 50, cacheReadTokens: 300, cacheWriteTokens: 0, reasoningTokens: 0 },
    { seq: 2, time: today, sessionId: 's1', turn: 1, step: 1, provider: 'deepseek', model: 'deepseek-chat', inputTokens: 40, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
    { seq: 3, time: today - DAY, sessionId: 's1', turn: 1, step: 0, provider: 'opencode-go', model: 'minimax-m3', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
  ]
  store.addRows(rows)
  const prices = [
    { provider: 'deepseek', model: 'deepseek-chat', input: 0.28, output: 0.42, cacheRead: 0.07, cacheWrite: 0.28 },
  ]
  const summary = summarize(store.all(), 30, prices)
  assert.equal(summary.totals.requests, 3)
  assert.equal(summary.totals.inputTokens, 1140)
  assert.equal(summary.totals.cacheReadTokens, 300)
  assert.equal(summary.totals.billedInputTokens, 1440)
  assert.equal(summary.totals.cacheHitRate, 300 / 1440)
  // cost: (100+0)/1e6*0.28 + 300/1e6*0.07 + 50/1e6*0.42  +  (40)/1e6*0.28 + 10/1e6*0.42
  const expectedCost = (100 / 1e6) * 0.28 + (300 / 1e6) * 0.07 + (50 / 1e6) * 0.42 + (40 / 1e6) * 0.28 + (10 / 1e6) * 0.42
  assert.ok(Math.abs(summary.totals.cost - expectedCost) < 1e-12, `cost ${summary.totals.cost} ≈ ${expectedCost}`)
  assert.equal(summary.models.length, 2, 'two models')
  const deepseek = summary.models.find(m => m.model === 'deepseek-chat')
  assert.equal(deepseek?.requests, 2)
  assert.equal(deepseek?.cacheHitRate, 300 / 440, 'per-model cache hit rate is finalized')
  const minimax = summary.models.find(m => m.model === 'minimax-m3')
  assert.equal(minimax?.cacheHitRate, 0, 'model without cache reads has zero hit rate')
  assert.equal(summary.daily.length, 30, 'daily window covers 30 days')
  assert.equal(summary.daily[0].requests, 0, 'oldest day is the first bucket')
  assert.equal(summary.daily[29].requests, 2, 'today is the last bucket')
  assert.equal(summary.daily[28].requests, 1, 'yesterday is the second-to-last bucket')
  assert.equal(localDateKey(summary.since), localDateKey(today - 29 * DAY))
  assert.equal(localDateKey(summary.daily[0].date), localDateKey(today - 29 * DAY))
  store.dispose()
  rmSync(dir, { recursive: true, force: true })
  console.log('2. aggregate + pricing OK')
}

// ---------------------------------------------------------------------------
// 3. heatmap cells + raw filter
// ---------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'usage-heatmap-smoke-'))
  const store = new UsageStore({ dir, log: () => {} })
  store.load()
  const now = Date.now()
  const today = startOfLocalDay(now)
  store.addRows([
    { seq: 1, time: today, sessionId: 's1', turn: 1, step: 0, provider: 'p', model: 'm', inputTokens: 10, outputTokens: 0, cacheReadTokens: 90, cacheWriteTokens: 0, reasoningTokens: 0 },
  ])
  const cells = heatmap(store.all(), 26, today - 25 * DAY, today + DAY - 1)
  assert.equal(cells.length, 26 * 7, 'full week grid')
  const todayCell = cells.find(c => c.date === localDateKey(today))
  assert.equal(todayCell?.totalTokens, 100)
  assert.equal(todayCell?.requests, 1)
  assert.equal(todayCell?.cacheHitRate, 0.9)
  const raw = rawRows(store.all(), today - DAY, today + DAY - 1, 'p', 'm')
  assert.equal(raw.length, 1)
  assert.equal(rawRows(store.all(), today - DAY, today + DAY - 1, 'p', 'other').length, 0)
  store.dispose()
  rmSync(dir, { recursive: true, force: true })
  console.log('3. heatmap + raw OK')
}

// ---------------------------------------------------------------------------
// 4. routes: registration, JSON shape, same-origin fence, method guard
// ---------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'usage-heatmap-smoke-'))
  const store = new UsageStore({ dir, log: () => {} })
  store.load()
  const now = Date.now()
  const today = startOfLocalDay(now)
  store.addRows([
    { seq: 1, time: today, sessionId: 's1', turn: 1, step: 0, provider: 'deepseek', model: 'deepseek-chat', inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: 0 },
  ])
  const routes: Array<{ kind: string; path: string; handler: (req: unknown, res: unknown) => void }> = []
  const fakeWebServer = {
    register(route: { kind: string; path: string; handler: (req: never, res: never) => void }) {
      routes.push(route as never)
      return () => {}
    },
  } as never
  const dispose = registerUsageRoutes(fakeWebServer, store, {
    pricing: [{ provider: 'deepseek', model: 'deepseek-chat', input: 0.28, output: 0.42, cacheRead: 0.07, cacheWrite: 0.28 }],
  })
  assert.equal(routes.length, 4, 'three exact API routes + one prefix page route')
  assert.ok(routes.every(r => r.path.startsWith('/_dsh/usage-heatmap')))
  assert.equal(routes.find(r => r.kind === 'prefix')?.path, '/_dsh/usage-heatmap')

  function call(route: { handler: (req: never, res: never) => void }, req: Record<string, unknown>) {
    const result: { status?: number; headers: Record<string, string>; body: string } = { headers: {}, body: '' }
    const res = {
      setHeader(k: string, v: string) { result.headers[k] = v },
      writeHead(s: number) { result.status = s },
      end(b: string) { result.body = String(b) },
    }
    route.handler(req as never, res as never)
    return result
  }
  const okReq = (path: string) => ({ method: 'GET', url: path, headers: { host: '127.0.0.1:40742', origin: 'http://127.0.0.1:40742' } })

  const summaryRoute = routes.find(r => r.path === '/_dsh/usage-heatmap/api/summary')!
  const s = call(summaryRoute, okReq('/_dsh/usage-heatmap/api/summary?days=30'))
  assert.equal(s.status, 200)
  const body = JSON.parse(s.body)
  assert.equal(body.ok, true)
  assert.equal(body.value.totals.requests, 1)
  assert.equal(body.value.daily.length, 30)

  const heatRoute = routes.find(r => r.path === '/_dsh/usage-heatmap/api/heatmap')!
  const h = call(heatRoute, okReq('/_dsh/usage-heatmap/api/heatmap?weeks=26'))
  assert.equal(JSON.parse(h.body).value.cells.length, 26 * 7)

  const rawRoute = routes.find(r => r.path === '/_dsh/usage-heatmap/api/raw')!
  const r = call(rawRoute, okReq('/_dsh/usage-heatmap/api/raw?days=30&model=deepseek-chat'))
  assert.equal(JSON.parse(r.body).value.count, 1)

  // Same-origin fence: cross-origin browser request refused.
  const cross = call(summaryRoute, { method: 'GET', url: '/_dsh/usage-heatmap/api/summary', headers: { host: '127.0.0.1:40742', origin: 'http://evil.example' } })
  assert.equal(cross.status, 403)
  assert.equal(JSON.parse(cross.body).ok, false)

  // Method guard.
  const post = call(summaryRoute, { method: 'POST', url: '/_dsh/usage-heatmap/api/summary', headers: { host: '127.0.0.1:40742', origin: 'http://127.0.0.1:40742' } })
  assert.equal(post.status, 405)

  // Page route serves HTML.
  const pageRoute = routes.find(r => r.kind === 'prefix')!
  const page = call(pageRoute, okReq('/_dsh/usage-heatmap/'))
  assert.equal(page.status, 200)
  assert.ok(page.headers['Content-Type']?.includes('text/html'))
  assert.ok(page.body.includes('DSH 用量热力图'))
  assert.ok(!page.body.includes('innerHTML'), 'page must not use innerHTML')

  dispose()
  store.dispose()
  rmSync(dir, { recursive: true, force: true })
  console.log('4. routes OK')
}

console.log('ALL SMOKE TESTS PASSED')
