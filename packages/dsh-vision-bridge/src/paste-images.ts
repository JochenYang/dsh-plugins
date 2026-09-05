/**
 * Same-origin paste upload endpoint for dsh-vision-bridge.
 *
 * The browser paste integration POSTs clipboard images here; this backend
 * writes them into the session workspace (.dsh-vision-bridge/pasted-images/)
 * and returns the absolute path. The composer message then only carries a
 * text marker, so DSH's native image gates never see an image part.
 *
 * Modeled on @anionex/dsh-vision-toolkit's paste-images backend (MIT).
 */

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'

/** Exact route used by the browser paste integration. */
export const PASTE_IMAGES_ROUTE = '/_dsh/vision-bridge/paste-images'

/** Where pasted images live: the DSH cache (default) or the session workspace. */
export type PasteStorage = 'cache' | 'workspace'

/** Cache-mode sweep: drop pasted image files older than this. */
const MAX_PASTE_AGE_MS = 7 * 24 * 60 * 60 * 1000

const MAX_NAME_BYTES = 180

interface PasteSuccess {
  ok: true
  value: { absolutePath: string; filename: string; bytes: number }
}

interface PasteFailure {
  ok: false
  error: { code: string; message: string }
}

type PasteResult = PasteSuccess | PasteFailure

function responseJson(res: ServerResponse, status: number, body: PasteResult): void {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.writeHead(status)
  res.end(bytes)
}

function requestError(res: ServerResponse, status: number, code: string, message: string): void {
  responseJson(res, status, { ok: false, error: { code, message } })
}

function singleQuery(url: URL, key: string): string {
  const values = url.searchParams.getAll(key)
  if (values.length !== 1 || values[0] === undefined || values[0] === '') {
    throw new TypeError(`${key} is required exactly once`)
  }
  return values[0]
}

function declaredSize(url: URL): number {
  const value = Number(singleQuery(url, 'size'))
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('size must be a positive safe integer')
  return value
}

function imageMediaType(req: IncomingMessage): string {
  const value = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (value === undefined || !value.startsWith('image/')) throw new TypeError('Content-Type must be image/*')
  return value
}

function extensionFor(mediaType: string): string {
  switch (mediaType) {
    case 'image/jpeg': return '.jpg'
    case 'image/png': return '.png'
    case 'image/gif': return '.gif'
    case 'image/webp': return '.webp'
    case 'image/bmp': return '.bmp'
    default: return '.img'
  }
}

/** Convert an untrusted browser label into one portable leaf filename. */
export function safePastedImageName(raw: string, mediaType: string): string {
  const leaf = basename(raw.replaceAll('\\', '/')).normalize('NFC')
  let cleaned = leaf
    .replace(/[<>:"|?*\u0000-\u001f/\\]/gu, '_')
    .replace(/\s+/gu, ' ')
    .replace(/^\.+/u, '')
    .trim()
    .replace(/[. ]+$/u, '')
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(cleaned)) cleaned = `_${cleaned}`
  const fallback = `clipboard-image${extensionFor(mediaType)}`
  const candidate = cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned
  if (Buffer.byteLength(candidate) <= MAX_NAME_BYTES) return candidate
  const extension = extname(candidate).slice(0, 20)
  const budget = Math.max(1, MAX_NAME_BYTES - Buffer.byteLength(extension))
  let stem = candidate.slice(0, Math.max(1, candidate.length - extension.length))
  while (Buffer.byteLength(stem) > budget) stem = stem.slice(0, -1)
  return `${stem}${extension}`
}

/** Reject a resolved path that is not rooted below the expected directory. */
export function ensurePathInside(root: string, target: string): void {
  const rel = relative(root, target)
  if (rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))) {
    throw new Error(`resolved pasted-image path escapes its workspace root: ${target}`)
  }
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    // recursive: true so every intermediate level (e.g. the workspace root,
    // `.dsh-vision-bridge`) is created on first use instead of failing ENOENT.
    await mkdir(path, { recursive: true, mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const entry = await lstat(path)
  if (entry.isSymbolicLink()) throw new Error(`pasted-image path is a symbolic link: ${path}`)
  if (!entry.isDirectory()) throw new Error(`pasted-image path is not a directory: ${path}`)
}

/** DSH_HOME override, falling back to ~/.dsh (the desktop default). */
function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv.trim() !== '' ? resolve(fromEnv) : join(homedir(), '.dsh')
}

/** Delete pasted-image files older than maxAgeMs, recursively (best-effort). */
async function sweepStalePastes(root: string, maxAgeMs: number): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return
  }
  const cutoff = Date.now() - maxAgeMs
  for (const entry of entries) {
    const full = join(root, entry)
    try {
      const st = await lstat(full)
      if (st.isFile() && !st.isSymbolicLink() && st.mtimeMs < cutoff) {
        await rm(full, { force: true })
      } else if (st.isDirectory() && !st.isSymbolicLink()) {
        await sweepStalePastes(full, maxAgeMs)
      }
    } catch {
      // best-effort sweep; never fail the paste for cleanup trouble
    }
  }
}

async function sessionPasteRoot(ctx: Context, sessionId: string, storage: PasteStorage): Promise<string> {
  const sessionKey = createHash('sha256').update(sessionId).digest('hex').slice(0, 20)
  if (storage === 'cache') {
    // Cache mode: never touches the workspace — any workspace (or none) works,
    // and projects are not polluted with a hidden directory.
    const root = join(dshHome(), 'cache', 'dsh-vision-bridge', 'pasted-images')
    await ensureDirectory(root)
    await sweepStalePastes(root, MAX_PASTE_AGE_MS)
    const sessionRoot = join(root, sessionKey)
    await ensureDirectory(sessionRoot)
    ensurePathInside(root, sessionRoot)
    return sessionRoot
  }
  const sessions = ctx.sessions as unknown as {
    get(id: string): { header: { cwd?: string } } | undefined
  }
  const session = sessions.get(sessionId)
  const cwd = session?.header?.cwd
  if (cwd === undefined || cwd === '' || !isAbsolute(cwd)) {
    throw new Error(`live Session has no absolute workspace: ${sessionId}`)
  }
  const workspace = await realpath(cwd)
  const root = join(workspace, '.dsh-vision-bridge', 'pasted-images')
  await ensureDirectory(root)
  const sessionRoot = join(root, sessionKey)
  await ensureDirectory(sessionRoot)
  ensurePathInside(root, sessionRoot)
  return sessionRoot
}

async function writeImage(
  req: IncomingMessage,
  directory: string,
  filename: string,
  expectedBytes: number,
  maxBytes: number,
): Promise<string> {
  if (expectedBytes > maxBytes) throw new RangeError(`image exceeds the ${maxBytes}-byte paste limit`)
  const id = randomUUID()
  const finalPath = join(directory, `${id}-${filename}`)
  const stagingPath = join(directory, `.${id}.partial`)
  ensurePathInside(directory, finalPath)
  ensurePathInside(directory, stagingPath)

  const handle = await open(stagingPath, 'wx', 0o600)
  let received = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      received += buffer.length
      if (received > expectedBytes || received > maxBytes) throw new RangeError('pasted image body exceeds its declared size')
      await handle.write(buffer)
    }
    if (received !== expectedBytes) {
      throw new Error(`pasted image body size mismatch: expected ${expectedBytes}, received ${received}`)
    }
    await handle.sync()
    await handle.close()
    await rename(stagingPath, finalPath)
    return finalPath
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(stagingPath, { force: true }).catch(() => {})
    throw error
  }
}

/** Reject cross-origin POSTs; the browser sends an Origin header on cross-origin requests. */
function sameOriginPost(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined || origin === 'null') return false
  try {
    const parsed = new URL(origin)
    const host = req.headers.host
    if (host === undefined) return false
    const hostname = host.split(':')[0]
    const port = host.includes(':') ? host.split(':')[1] : '80'
    return parsed.hostname === hostname && (parsed.port === '' || parsed.port === port)
  } catch {
    return false
  }
}

/** Runtime limit face kept separate for focused backend tests. */
export interface PasteImageRuntime {
  maxImageBytes(): number
  storage: PasteStorage
}

/** Same-origin, live-Session-bound image upload endpoint. */
export class PastedImageBackend {
  constructor(
    private readonly ctx: Context,
    private readonly runtime: PasteImageRuntime,
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      requestError(res, 405, 'method-not-allowed', 'Use POST')
      return
    }
    if (!sameOriginPost(req)) {
      requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
      return
    }

    try {
      const url = new URL(req.url ?? PASTE_IMAGES_ROUTE, 'http://dsh.internal')
      const sessionId = singleQuery(url, 'sessionId')
      const size = declaredSize(url)
      const mediaType = imageMediaType(req)
      const filename = safePastedImageName(singleQuery(url, 'name'), mediaType)
      const contentLength = req.headers['content-length']
      if (contentLength !== undefined && Number(contentLength) !== size) {
        throw new TypeError('Content-Length does not match the declared size')
      }
      const directory = await sessionPasteRoot(this.ctx, sessionId, this.runtime.storage)
      const writtenPath = await writeImage(req, directory, filename, size, this.runtime.maxImageBytes())
      responseJson(res, 201, {
        ok: true,
        value: { absolutePath: writtenPath, filename: basename(writtenPath), bytes: size },
      })
    } catch (error) {
      const status = error instanceof RangeError ? 413 : 400
      this.ctx.logger.warn(
        'dsh-vision-bridge pasted image rejected: %s',
        error instanceof Error ? error.message : String(error),
      )
      requestError(res, status, 'paste-image-rejected', error instanceof Error ? error.message : String(error))
    }
  }
}

