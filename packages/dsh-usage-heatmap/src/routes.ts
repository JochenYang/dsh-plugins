/**
 * HTTP surface of dsh-usage-heatmap: the JSON API and the self-contained
 * heatmap page, registered on the host webserver. API responses follow the
 * DSH wire shape `{ok, value}` / `{ok:false, error:{code,message}}`; all
 * responses are same-origin guarded (absent Origin = non-browser client).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { heatmap, rawRows, startOfLocalDay, summarize, type PricingEntry } from './aggregate.js'
import { PAGE_HTML } from './page.js'
import type { UsageStore } from './store.js'

const BASE = '/_dsh/usage-heatmap'
const DAY_MS = 86_400_000

export interface UsageRouteOptions {
  /** Pricing table for cost estimation. */
  pricing: readonly PricingEntry[]
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.writeHead(status)
  res.end(bytes)
}

function ok(res: ServerResponse, value: unknown): void {
  sendJson(res, 200, { ok: true, value })
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { ok: false, error: { code, message } })
}

/**
 * Same-origin fence: browsers attach an Origin header on fetch/XHR, non-browser
 * clients (curl, the CLI) omit it. Anything with a mismatching Origin is refused.
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined || origin === '') return true
  const host = req.headers.host
  if (host === undefined) return false
  return origin === `http://${host}` || origin === `https://${host}`
}

function readDays(req: IncomingMessage, fallback: number): number {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const raw = url.searchParams.get('days')
  if (raw === null) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 366) return fallback
  return parsed
}

function readInt(req: IncomingMessage, key: string, fallback: number, max: number): number {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const raw = url.searchParams.get(key)
  if (raw === null) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) return fallback
  return parsed
}

function readString(req: IncomingMessage, key: string): string | undefined {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const raw = url.searchParams.get(key)
  return raw === null || raw === '' ? undefined : raw
}

function guard(req: IncomingMessage, res: ServerResponse): boolean {
  if (!sameOrigin(req)) {
    fail(res, 403, 'forbidden', 'cross-origin request refused')
    return false
  }
  return true
}

function requireGet(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    fail(res, 405, 'method-not-allowed', 'GET only')
    return false
  }
  return true
}

/**
 * Register the plugin's routes. Returns the disposer removing every route.
 * @param webServer - the host webserver service.
 * @param store - the usage store.
 * @param options - pricing and page markup.
 */
export function registerUsageRoutes(
  webServer: WebServer,
  store: UsageStore,
  options: UsageRouteOptions,
): () => void {
  const summaryHandler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!guard(req, res) || !requireGet(req, res)) return
    const days = readDays(req, 30)
    ok(res, summarize(store.all(), days, options.pricing))
  }

  const heatmapHandler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!guard(req, res) || !requireGet(req, res)) return
    const weeks = readInt(req, 'weeks', 26, 104)
    const now = Date.now()
    const until = startOfLocalDay(now) + DAY_MS - 1
    const since = startOfLocalDay(now) - (weeks * 7 - 1) * DAY_MS
    ok(res, { weeks, since, until, cells: heatmap(store.all(), weeks, since, until) })
  }

  const rawHandler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!guard(req, res) || !requireGet(req, res)) return
    const days = readDays(req, 30)
    const provider = readString(req, 'provider')
    const model = readString(req, 'model')
    const now = Date.now()
    const until = startOfLocalDay(now) + DAY_MS - 1
    const since = startOfLocalDay(now) - (days - 1) * DAY_MS
    const rows = rawRows(store.all(), since, until, provider, model)
    ok(res, { count: rows.length, rows: rows.slice(-2000) })
  }

  const pageHandler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!guard(req, res) || !requireGet(req, res)) return
    const bytes = Buffer.from(PAGE_HTML)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Length', String(bytes.length))
    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(200)
    res.end(bytes)
  }

  const disposers = [
    webServer.register({ kind: 'exact', path: `${BASE}/api/summary`, handler: summaryHandler }),
    webServer.register({ kind: 'exact', path: `${BASE}/api/heatmap`, handler: heatmapHandler }),
    webServer.register({ kind: 'exact', path: `${BASE}/api/raw`, handler: rawHandler }),
    webServer.register({ kind: 'prefix', path: BASE, handler: pageHandler }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}
