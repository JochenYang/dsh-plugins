/**
 * dsh-vision-bridge browser half: capture clipboard images pasted into the
 * composer and route them by the current model's capability.
 *
 * pasteMode (served by the host at /_dsh/vision-bridge/config):
 * - 'auto' / 'path' (default): upload to the paste route and insert a text
 *   path marker (`[pasted image N: <path>]`). The message never carries an
 *   image part, so DSH's image gates — including the "session already
 *   contains images" model-switch guard — never fire, and the session model
 *   can be switched freely between multimodal and text-only routes. The
 *   model reads the image through vision_glance.
 * - 'native': never intercept — DSH's native paste handling runs untouched
 *   (native image parts may enter the session, which then cannot switch to
 *   a text-only model; use only for single-model sessions).
 *
 * Native draft re-insertion is deliberately absent: an image part in the
 * session history is what makes DSH refuse switching to a text-only model.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'

/** Same-origin routes served by the host bundle. */
const PASTE_IMAGES_ROUTE = '/_dsh/vision-bridge/paste-images'
const CONFIG_ROUTE = '/_dsh/vision-bridge/config'

const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

type PasteMode = 'auto' | 'path' | 'native'

/** Cached mode from the host; 'auto' is the safe default before/without config. */
let pasteMode: PasteMode = 'auto'

export const inject = ['conversation', 'sessions', 'modelDirectories']

interface PasteConfig {
  ok: boolean
  value?: { pasteMode?: PasteMode }
}

interface UploadResult {
  ok: boolean
  value?: { absolutePath?: string; canAcceptImages?: boolean }
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
function modelHint(ctx: ClientContext, sessionId: string): string {
  try {
    const directories = ctx.modelDirectories as unknown as {
      directoryFor?(id: string): { current?: { provider?: string; model?: string } | null }
    } | undefined
    const current = directories?.directoryFor?.(sessionId)?.current
    if (current !== null && current !== undefined
      && typeof current.provider === 'string' && typeof current.model === 'string') {
      return `&provider=${encodeURIComponent(current.provider)}&model=${encodeURIComponent(current.model)}`
    }
  } catch {
    // no hint — the host falls back to the session's logged model
  }
  return ''
}

async function uploadImage(ctx: ClientContext, sessionId: string, file: File): Promise<UploadResult> {
  const query = new URLSearchParams({
    sessionId,
    name: file.name || 'clipboard-image',
    size: String(file.size),
  })
  const hint = modelHint(ctx, sessionId)
  const response = await fetch(`${PASTE_IMAGES_ROUTE}?${query.toString()}${hint}`, {
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


export function apply(ctx: ClientContext): void {
  void refreshConfig()
  ctx.effect(() => {
    const listener = (event: ClipboardEvent): void => { void handlePaste(ctx, event) }
    document.addEventListener('paste', listener, true)
    return () => { document.removeEventListener('paste', listener, true) }
  }, 'dsh-vision-bridge: clipboard image capture')
}

async function refreshConfig(): Promise<void> {
  try {
    const response = await fetch(CONFIG_ROUTE, { credentials: 'same-origin' })
    const body = await response.json() as PasteConfig
    if (response.ok && body.ok === true) {
      const mode = body.value?.pasteMode
      pasteMode = mode === 'path' || mode === 'native' ? mode : 'auto'
    }
  } catch {
    // keep the safe 'auto' default
  }
}

async function handlePaste(ctx: ClientContext, event: ClipboardEvent): Promise<void> {
  const files = imageFiles(event.clipboardData)
  if (files.length === 0) return
  if (files.length > MAX_IMAGES) {
    ctx.logger?.warn?.(`dsh-vision-bridge: paste rejected: at most ${MAX_IMAGES} images at a time`)
    return
  }
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement) || target.closest('[data-composer-card]') === null) return
  if (pasteMode === 'native') return // let DSH's native paste handling run

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const sessionId = ctx.sessions.list.getSnapshot().current
  if (sessionId === undefined) return
  const actx = ctx.sessions.scope(sessionId)
  if (actx === undefined) return
  const input = ctx.conversation.input.for(actx) as unknown as SessionInputLike
  const snapshot = input.state.getSnapshot()
  if (snapshot.phase !== 'plain') return

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
