/**
 * dsh-pet server half.
 *
 * Configuration channel: the desktop app isolates the browser-visible
 * settings store from the plugin host environment, so pet preferences are
 * served over a dedicated HTTP route instead of the settings namespace:
 *   GET  /_dsh/pet/config -> { ok: true, value: <resolved config> }
 *   POST /_dsh/pet/config -> { ok: true, value: <resolved config> }  (body: { value })
 * Values are validated/merged through the same schemastery schema that
 * defines the defaults, then persisted to <DSH_HOME>/cache/dsh-pet/config.json.
 * The settings namespace is still registered for host-side visibility, but
 * the browser half no longer depends on it.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
// Type-only: pull ctx.settings / ctx.webServer Context merges into this program.
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { SETTINGS_NS, PetSettingsSchema, type PetSettings } from './settings.js'

/** Cordis plugin name. */
export const name = 'dsh-pet'

/** Required services: webServer mounts the routes; settings is optional (host-side only). */
export const inject = ['settings']

/** Package assets directory (lib/.. + assets). */
const ASSETS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

const ROUTE_PREFIX = '/_dsh/pet/assets'
const CONFIG_ROUTE = '/_dsh/pet/config'

/** Persisted user overrides (merged over schema defaults). */
const CONFIG_FILE = join(homedir(), '.dsh', 'cache', 'dsh-pet', 'config.json')

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

/** @param ctx - Cordis context (settings service injected). */
export function apply(ctx: Context): void {
  // Host-side visibility only (the browser half uses the HTTP route).
  try {
    ctx.settings.register(settingsNamespace(SETTINGS_NS), PetSettingsSchema)
  } catch {
    // Never fatal: the HTTP config channel is the authoritative surface.
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposeAssets = webCtx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => { void serveAsset(req, res) },
      })
      const disposeConfig = webCtx.webServer.register({
        kind: 'exact',
        path: CONFIG_ROUTE,
        handler: (req, res) => { void handleConfig(req, res) },
      })
      return () => { disposeConfig(); disposeAssets() }
    }, 'dsh-pet: routes')
  })
}

/** Resolve config: schema defaults merged with persisted user overrides. */
function loadConfig(): PetSettings {
  try {
    return PetSettingsSchema(readUserSection() as PetSettings)
  } catch {
    return PetSettingsSchema({} as PetSettings)
  }
}

function readUserSection(): Partial<PetSettings> {
  try {
    if (!existsSync(CONFIG_FILE)) return {}
    const raw = readFileSync(CONFIG_FILE, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Partial<PetSettings>
      : {}
  } catch {
    return {}
  }
}

function saveConfig(value: unknown): PetSettings {
  const resolved = PetSettingsSchema(value as PetSettings)
  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(resolved, null, 2), 'utf8')
  } catch {
    // Persistence is best-effort; the resolved value still answers this request.
  }
  return resolved
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body), 'utf8')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.writeHead(status)
  res.end(bytes)
}

function readBody(req: import('node:http').IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) { rejectBody(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectBody)
  })
}

function handleConfig(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void {
  if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, { ok: true, value: loadConfig() })
    return
  }
  if (req.method === 'POST') {
    void readBody(req).then((text) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        sendJson(res, 200, { ok: false, error: { message: 'body is not JSON' } })
        return
      }
      const body = parsed as { value?: unknown }
      if (body === null || typeof body !== 'object' || !('value' in body)) {
        sendJson(res, 200, { ok: false, error: { message: 'missing "value" field' } })
        return
      }
      const value = saveConfig(body.value)
      sendJson(res, 200, { ok: true, value })
    }).catch(() => {
      sendJson(res, 200, { ok: false, error: { message: 'body read failed' } })
    })
    return
  }
  res.setHeader('Allow', 'GET, POST')
  res.writeHead(405)
  res.end()
}

/** Strip the route prefix + query, then resolve (and confine) the requested file. */
function resolveAssetPath(rawUrl: string): string | undefined {
  const pathname = rawUrl.split('?')[0] ?? ''
  if (!pathname.startsWith(ROUTE_PREFIX)) return undefined
  const name = pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, '')
  if (name === '' || name.includes('..')) return undefined
  if (!/^[A-Za-z0-9_./-]+$/.test(name)) return undefined
  const resolved = resolve(ASSETS_ROOT, name)
  if (resolved !== ASSETS_ROOT && !resolved.startsWith(ASSETS_ROOT + '\\') && !resolved.startsWith(ASSETS_ROOT + '/')) return undefined
  return resolved
}

function serveAsset(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    res.writeHead(405)
    res.end()
    return
  }
  const url = req.url ?? '/'
  const filePath = resolveAssetPath(url)
  if (filePath === undefined || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const type = CONTENT_TYPES[ext] ?? 'application/octet-stream'
  const size = statSync(filePath).size
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', String(size))
  res.setHeader('Cache-Control', 'public, max-age=300')
  if (req.method === 'HEAD') {
    res.writeHead(200)
    res.end()
    return
  }
  res.writeHead(200)
  createReadStream(filePath).pipe(res)
}
