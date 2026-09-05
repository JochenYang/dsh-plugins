/**
 * dsh-vision-bridge browser half: capture clipboard images pasted into the
 * composer and route them by the current model's capability.
 *
 * pasteMode (served by the host at /_dsh/vision-bridge/config):
 * - 'auto' (default): intercept only when the session's current model cannot
 *   accept native image input — the image is uploaded to the paste route and
 *   the composer gets a text path marker (`[pasted image N: <path>]`), so
 *   DSH's image gates — including the "session already contains images"
 *   model-switch guard — never fire and the model reads the image through
 *   vision_glance. When the model CAN accept images the event is released
 *   untouched and DSH's native paste flow attaches the image natively.
 * - 'path': always intercept, regardless of capability.
 * - 'native': never intercept — DSH's native paste handling runs untouched
 *   (native image parts may enter the session, which then cannot switch to
 *   a text-only model; use only for single-model sessions).
 *
 * The capability verdict is cached from the host and refreshed on session
 * and model-selection changes, because the paste handler must decide
 * synchronously. A cache miss degrades to the marker flow — always safe for
 * text-only models; a just-switched multimodal model may see one marker
 * paste before the refresh lands.
 *
 * Native draft re-insertion is deliberately absent: an image part in the
 * session history is what makes DSH refuse switching to a text-only model.
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: ctx.sessions Context merge lives in dsh-api-session-controller.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Same-origin routes served by the host bundle. */
const PASTE_IMAGES_ROUTE = '/_dsh/vision-bridge/paste-images'
const CONFIG_ROUTE = '/_dsh/vision-bridge/config'

const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

type PasteMode = 'auto' | 'path' | 'native'

/** Mode from the host; 'auto' is the safe default before/without config. */
let pasteMode: PasteMode = 'auto'

/**
 * Cached capability verdict for the current session+model. false until the
 * host says otherwise: an unresolved or failed check degrades to the marker
 * flow, which is always safe for text-only models.
 */
let canAcceptImages = false

/** Session+model key of the last fetch that produced a definitive verdict. */
let lastRuntimeKey = ''

/** Monotonic refresh counter; stale in-flight responses are discarded. */
let refreshGeneration = 0

export const inject = ['conversation', 'sessions', 'modelDirectories']

interface RuntimeConfig {
  ok: boolean
  value?: { pasteMode?: PasteMode; canAcceptImages?: boolean | null }
}

interface UploadResult {
  ok: boolean
  value?: { absolutePath?: string }
  error?: { message?: string }
}

function imageFiles(data: DataTransfer | null): File[] {
  if (data === null) return []
  const fromItems = Array.from(data.items)
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
  const candidates = fromItems.length > 0 ? fromItems : Array.from(data.files)
  return candidates.filter(file => file.type.toLowerCase().startsWith('image/'))
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Best-effort current model hint from the model-selection directory. */
function modelHint(ctx: Context, sessionId: string): string {
  try {
    const current = ctx.modelDirectories.directoryFor(sessionId as SessionId).store.getSnapshot().current
    if (current !== null && current !== undefined
      && typeof current.provider === 'string' && typeof current.model === 'string') {
      return `&provider=${encodeURIComponent(current.provider)}&model=${encodeURIComponent(current.model)}`
    }
  } catch {
    // no hint — the host falls back to the session's logged model
  }
  return ''
}

function currentSessionId(ctx: Context): string | undefined {
  return ctx.sessions.list.getSnapshot().current
}

/**
 * Refresh cached mode + capability from the host for the current session and
 * model. Skipped when the session+model key is unchanged. A `null` verdict
 * (host could not resolve the model) leaves the previous cache in place and
 * does NOT record the key, so the next invalidation retries. Stale in-flight
 * responses are discarded by generation so a slow answer for a previous
 * session/model never overwrites the current verdict.
 */
async function refreshRuntime(ctx: Context): Promise<void> {
  const sessionId = currentSessionId(ctx)
  const hint = sessionId === undefined ? '' : modelHint(ctx, sessionId)
  const key = `${sessionId ?? ''}${hint}`
  if (key === lastRuntimeKey) return
  const generation = ++refreshGeneration
  try {
    const response = await fetch(
      `${CONFIG_ROUTE}?sessionId=${encodeURIComponent(sessionId ?? '')}${hint}`,
      { credentials: 'same-origin' },
    )
    const body = await response.json() as RuntimeConfig
    if (!response.ok || body.ok !== true) return
    if (generation !== refreshGeneration) return
    const mode = body.value?.pasteMode
    pasteMode = mode === 'path' || mode === 'native' ? mode : 'auto'
    const verdict = body.value?.canAcceptImages
    if (verdict === true || verdict === false) {
      canAcceptImages = verdict
      lastRuntimeKey = key
    }
  } catch {
    // keep the previous safe values; the next invalidation retries
  }
}

async function uploadImage(ctx: Context, sessionId: string, file: File): Promise<UploadResult> {
  const query = new URLSearchParams({
    sessionId,
    name: file.name || 'clipboard-image',
    size: String(file.size),
  })
  const response = await fetch(`${PASTE_IMAGES_ROUTE}?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  const body = await response.json() as UploadResult
  if (!response.ok || body.ok !== true) throw new Error(body.error?.message ?? `Image copy failed (${response.status})`)
  return body
}

interface SessionInputLike {
  state: { getSnapshot(): { draft: string; draftRev: number; phase: string } }
  setDraft(text: string): void
  addImages?(ids: readonly string[]): boolean
  notify(level: 'info' | 'error', text: string): void
}

/** Insert text into the draft at [start, end), returning the new cursor position. */
function insertAt(input: SessionInputLike, start: number, end: number, text: string): number {
  if (text === '') return start
  const snapshot = input.state.getSnapshot()
  input.setDraft(snapshot.draft.slice(0, start) + text + snapshot.draft.slice(end))
  return start + text.length
}


export function apply(ctx: Context): void {
  ctx.effect(() => {
    // The paste handler decides synchronously from the cached verdict, so the
    // cache is kept fresh by invalidation instead of an await at paste time.
    // The model-selection store is per-session: re-arm it on session switch
    // (session-list churn without a `current` change is ignored).
    let armedSessionId: string | undefined | null = null
    let unsubModel: (() => void) | undefined
    const rearm = (): void => {
      const sessionId = currentSessionId(ctx)
      if (sessionId === armedSessionId) return
      armedSessionId = sessionId
      unsubModel?.()
      unsubModel = undefined
      if (sessionId !== undefined) {
        try {
          const store = ctx.modelDirectories.directoryFor(sessionId as SessionId).store
          unsubModel = store.subscribe(() => { void refreshRuntime(ctx) })
        } catch {
          // model directory not mounted for this session yet
        }
      }
      void refreshRuntime(ctx)
    }
    const unsubSessions = ctx.sessions.list.subscribe(rearm)
    rearm()
    return () => {
      unsubSessions()
      unsubModel?.()
    }
  }, 'dsh-vision-bridge: capability cache refresh')

  ctx.effect(() => {
    const listener = (event: ClipboardEvent): void => { void handlePaste(ctx, event) }
    document.addEventListener('paste', listener, true)
    return () => { document.removeEventListener('paste', listener, true) }
  }, 'dsh-vision-bridge: clipboard image capture')
}

async function handlePaste(ctx: Context, event: ClipboardEvent): Promise<void> {
  const files = imageFiles(event.clipboardData)
  if (files.length === 0) return
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement) || target.closest('[data-composer-card]') === null) return
  if (pasteMode === 'native') return // let DSH's native paste handling run
  if (pasteMode === 'auto' && canAcceptImages) return // model reads natively; let DSH's paste flow run
  if (files.length > MAX_IMAGES) {
    ctx.logger?.warn?.(`dsh-vision-bridge: paste rejected: at most ${MAX_IMAGES} images at a time`)
    return
  }

  // Everything below owns the paste: swallow it so the native flow cannot also
  // attach image parts (which would lock the session to multimodal models).
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const sessionId = ctx.sessions.list.getSnapshot().current
  if (sessionId === undefined) return
  const actx = ctx.sessions.scope(sessionId)
  if (actx === undefined) return
  const input = ctx.conversation.input.for(actx) as unknown as SessionInputLike
  const snapshot = input.state.getSnapshot()
  if (snapshot.phase !== 'plain') {
    input.notify('info', '正在生成/提交中，本次图片粘贴已忽略，请稍后再试')
    return
  }

  const start = Math.max(0, Math.min(target.selectionStart ?? snapshot.draft.length, snapshot.draft.length))
  const end = Math.max(start, Math.min(target.selectionEnd ?? start, snapshot.draft.length))
  const clipboardText = (event.clipboardData?.getData('text/plain') ?? '').replaceAll('\uFFFC', '')

  try {
    let cursor = insertAt(input, start, end, clipboardText)
    for (const [index, file] of files.entries()) {
      if (file.size <= 0) throw new Error(`${file.name || 'clipboard image'} is empty`)
      if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name || 'clipboard image'} exceeds 10 MB`)
      const uploaded = await uploadImage(ctx, String(sessionId), file)
      const absolutePath = uploaded.value?.absolutePath
      if (typeof absolutePath !== 'string' || absolutePath === '') {
        throw new Error('Image copy response contained an invalid path')
      }
      const marker = `[pasted image ${index + 1}: ${absolutePath}]`
      if (index === 0 && clipboardText !== '' && !/\s$/u.test(snapshot.draft.slice(0, cursor))) {
        cursor = insertAt(input, cursor, cursor, ' ')
      }
      cursor = insertAt(input, cursor, cursor, marker)
    }
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true })
      target.setSelectionRange(cursor, cursor)
    })
  } catch (error) {
    input.notify('error', `图片粘贴失败: ${messageOf(error)}`)
  }
}
