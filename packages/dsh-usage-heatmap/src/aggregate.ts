/**
 * Aggregation and pricing for the usage store. All bucketing uses the host
 * machine's local timezone (the GUI and the host share one machine).
 */

import type { UsageRow } from './store.js'

/** Per-1M-token USD price for one exact provider/model route. */
export interface PricingEntry {
  provider: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** One day's (or model's) aggregated figures. */
export interface Agg {
  /** Local date key `YYYY-MM-DD` (day buckets) or empty for totals. */
  date: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  /** input + cacheRead + cacheWrite — what the provider actually billed as input. */
  billedInputTokens: number
  /** cacheRead / billedInputTokens, 0 when there is no billed input. */
  cacheHitRate: number
  /** Estimated USD when a pricing entry matches, else 0. */
  cost: number
}

export interface ModelAgg extends Agg {
  provider: string
  model: string
  /** Share of the period's billed input tokens across all models. */
  share: number
}

export interface SummaryAgg {
  since: number
  until: number
  totals: Agg
  models: ModelAgg[]
  daily: Agg[]
}

export interface DayCell {
  date: string
  requests: number
  /** input + output + cacheRead + cacheWrite (calendar intensity). */
  totalTokens: number
  /** cacheRead / billedInput, 0 when the day has no billed input. */
  cacheHitRate: number
}

/** Local date key for one epoch-ms value. */
export function localDateKey(time: number): string {
  const d = new Date(time)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Start of the local day for one epoch-ms value. */
export function startOfLocalDay(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Exact provider/model pricing lookup. */
export function priceFor(prices: readonly PricingEntry[], provider: string, model: string): PricingEntry | undefined {
  return prices.find(entry => entry.provider === provider && entry.model === model)
}

/** Estimated USD cost of one row. */
export function costOf(row: UsageRow, price: PricingEntry | undefined): number {
  if (price === undefined) return 0
  return (
    (row.inputTokens + row.cacheWriteTokens) / 1e6 * price.input
    + row.cacheReadTokens / 1e6 * price.cacheRead
    + row.outputTokens / 1e6 * price.output
  )
}

function emptyAgg(date: string): Agg {
  return {
    date,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    billedInputTokens: 0,
    cacheHitRate: 0,
    cost: 0,
  }
}

function addToAgg(target: Agg, row: UsageRow, price: PricingEntry | undefined): void {
  target.requests += 1
  target.inputTokens += row.inputTokens
  target.outputTokens += row.outputTokens
  target.cacheReadTokens += row.cacheReadTokens
  target.cacheWriteTokens += row.cacheWriteTokens
  target.reasoningTokens += row.reasoningTokens
  target.billedInputTokens += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens
  target.cost += costOf(row, price)
}

function finalize(agg: Agg): void {
  agg.cacheHitRate = agg.billedInputTokens > 0 ? agg.cacheReadTokens / agg.billedInputTokens : 0
}

/**
 * Aggregate rows over the last `days` local days (inclusive of today).
 * @param rows - all store rows.
 * @param days - lookback window in local days.
 * @param prices - pricing table for cost estimation.
 */
export function summarize(rows: readonly UsageRow[], days: number, prices: readonly PricingEntry[]): SummaryAgg {
  const until = startOfLocalDay(Date.now()) + 86_400_000 - 1
  const since = startOfLocalDay(Date.now()) - (days - 1) * 86_400_000

  const totals = emptyAgg('')
  const byDay = new Map<string, Agg>()
  const byModel = new Map<string, ModelAgg & { modelTokens: number }>()

  for (const row of rows) {
    if (row.time < since || row.time > until) continue
    const price = priceFor(prices, row.provider, row.model)
    addToAgg(totals, row, price)

    const dayKey = localDateKey(row.time)
    let day = byDay.get(dayKey)
    if (day === undefined) {
      day = emptyAgg(dayKey)
      byDay.set(dayKey, day)
    }
    addToAgg(day, row, price)

    const modelKey = `${row.provider}/${row.model}`
    let model = byModel.get(modelKey)
    if (model === undefined) {
      model = { ...emptyAgg(''), provider: row.provider, model: row.model, share: 0, modelTokens: 0 }
      byModel.set(modelKey, model)
    }
    model.modelTokens += row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
    addToAgg(model, row, price)
  }

  finalize(totals)
  // Oldest day first, newest (today) last — the same direction as the heatmap
  // cells, so trend charts read left-to-right in chronological order.
  const daily: Agg[] = []
  for (let offset = 0; offset < days; offset += 1) {
    const key = localDateKey(since + offset * 86_400_000)
    const day = byDay.get(key)
    if (day !== undefined) finalize(day)
    daily.push(day ?? emptyAgg(key))
  }

  const models = [...byModel.values()]
    .map(model => {
      // Per-model buckets need the same cache-hit-rate computation as totals
      // and days; without this, every model's hit rate stays 0.
      finalize(model)
      return { ...model, share: totals.billedInputTokens > 0 ? model.billedInputTokens / totals.billedInputTokens : 0 }
    })
    .sort((a, b) => b.billedInputTokens - a.billedInputTokens)

  return { since, until, totals, models, daily }
}

/**
 * Per-day calendar cells covering `weeks * 7` consecutive local days starting
 * at `since` (leading empty days included, so the client can draw a full week
 * grid without re-aligning).
 */
export function heatmap(rows: readonly UsageRow[], weeks: number, since: number, until: number): DayCell[] {
  const cells = new Map<string, DayCell & { billedInput: number }>()
  const empty = (key: string): DayCell & { billedInput: number } =>
    ({ date: key, requests: 0, totalTokens: 0, cacheHitRate: 0, billedInput: 0 })
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const key = localDateKey(since + offset * 86_400_000)
    cells.set(key, empty(key))
  }
  for (const row of rows) {
    if (row.time < since || row.time > until) continue
    const cell = cells.get(localDateKey(row.time))
    if (cell === undefined) continue
    cell.requests += 1
    cell.totalTokens += row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
    cell.cacheHitRate += row.cacheReadTokens
    cell.billedInput += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens
  }
  return [...cells.values()].map(({ billedInput, ...cell }) => ({
    ...cell,
    cacheHitRate: billedInput > 0 ? cell.cacheHitRate / billedInput : 0,
  }))
}

/** Filter raw rows by window and optional provider/model. */
export function rawRows(rows: readonly UsageRow[], since: number, until: number, provider?: string, model?: string): UsageRow[] {
  return rows.filter(row =>
    row.time >= since && row.time <= until
    && (provider === undefined || row.provider === provider)
    && (model === undefined || row.model === model))
}
