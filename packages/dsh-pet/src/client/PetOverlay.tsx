/**
 * PetOverlay: the floating fox in the shell.overlay slot (root scope).
 * - Reads pet settings (usePetConfig) and the mood tracker (usePetMood).
 * - Renders one atlas cell per frame with background-position animation.
 * - Draggable: pointer drag writes corner/offset back to the settings namespace.
 * - Clicking toggles a speech bubble with the latest assistant text.
 *
 * Hook discipline: ALL hooks (useState/useEffect/useCallback) run
 * unconditionally before any early return, so the hook count is stable
 * across the loading states.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent, ReactElement } from 'react'
import type { MoodSnapshot } from './mood'
import type { PetMood, PetSettingsClient } from './types'

const ASSETS = '/_dsh/pet/assets'

interface AtlasCell { x: number; y: number; w: number; h: number }

interface AtlasMeta {
  image: string
  width: number
  height: number
  cells: AtlasCell[]
  defaultAnimations: Record<string, number[]>
}

const VALID_MOODS: readonly string[] = ['idle', 'think', 'happy', 'sad', 'wave', 'sleep']

function parseFrames(value: string | undefined, max: number): number[] {
  if (value === undefined || value === '') return []
  const out: number[] = []
  for (const part of value.split(',')) {
    const n = Number.parseInt(part.trim(), 10)
    if (Number.isFinite(n) && n >= 1 && n <= max) out.push(n)
  }
  return out
}

/** Lightweight markdown -> readable plain text for the speech bubble. */
function cleanMarkdown(text: string): string {
  let out = text
    .replace(/```[\s\S]*?```/g, ' (代码块) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+[.、)]\s+/gm, '• ')
    .replace(/^[-\u2014\u2013_]{2,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out
}

/** Frame durations (ms) per animation, modulated by the speed setting. */
const FRAME_MS: Record<string, number> = {
  idle: 320,
  happy: 240,
  sad: 420,
  think: 480,
  sleep: 720,
  wave: 240,
}

/** Built-in pet lines per mood (二次元风格，随机出现). */
const BUBBLE_LINES: Record<PetMood, readonly string[]> = {
  idle: ['好无聊呀…', '陪我玩嘛~', '嗯？在忙吗？', '今天也要加油哦！', '悄悄看着你工作~', '咔，发会儿呆~', '尾巴要打结了…'],
  think: ['思考中…别打扰我喵！', '正在加载智慧……', '唔…让我想想~', '脑子转啊转…', '这个问题有点难，但难不倒我！', '拼命思考中！', '工作中…请稍候~', '处理中，很快就好！', '正在呼叫超算大脑…'],
  happy: ['搞定啦！', '太好啦！', '耶！开心！', '完成！我超棒的！', '嘿嘿，小事一桩~', '成功！撒花！'],
  sad: ['呜呜…出错了', '好难过…QAQ', '呜…我再努力一下', '失败了…呜呜', '脑袋冒烟了…'],
  wave: ['你好呀！', '嗨~欢迎！', '来啦来啦！', '好久不见！'],
  sleep: ['Zzz…', '呼噜呼噜…', '睡梦中…', 'zzZ 做个好梦…'],
}

/** Thinking lines rotate every this many ms while the model streams. */
const THINK_ROTATE_MS = 4200
/** Mood lines (happy/sad/wave) stay up this long. */
const MOOD_LINE_HOLD_MS = 4600
/** Sleep line hold. */
const SLEEP_LINE_HOLD_MS = 8000
/** Idle chit-chat cadence: first line after ~20s, then every 24-45s. */
const IDLE_FIRST_GAP_MS = 20000
const IDLE_LINE_GAP_MIN = 24000
const IDLE_LINE_GAP_MAX = 45000
const IDLE_LINE_HOLD_MS = 5200

/** Read the resolved section out of a settings-scope snapshot. */
function sectionOf(snapshot: unknown): PetSettingsClient | undefined {
  if (snapshot === undefined || snapshot === null) return undefined
  const s = snapshot as { status?: string; value?: PetSettingsClient }
  return s.status === 'ready' ? s.value : undefined
}

export interface PetOverlayProps {
  // Framework slots provide these hooks; signatures stay loose for structural
  // compatibility with the slot renderer's ComposedProps.
  useSessions?: (sel?: any, eq?: any) => any
  usePetConfig?: (sel?: any, eq?: any) => any
  usePetMood?: (sel?: any, eq?: any) => any
  petScope?: {
    set(field: string, value: unknown): Promise<void>
    getSnapshot?(): unknown
  }
}

export function PetOverlay(props: PetOverlayProps): ReactElement | null {
  // ---- Hooks (unconditional) ----
  const config = props.usePetConfig?.((s: any) => sectionOf(s)) as PetSettingsClient | undefined
  const moodSnap = props.usePetMood?.((s: MoodSnapshot) => s) as MoodSnapshot | undefined
  const [meta, setMeta] = useState<AtlasMeta | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null)
  const [bubble, setBubble] = useState<string | null>(null)
  const bubbleTimer = useRef<number | undefined>(undefined)
  const dragRef = useRef<{ startX: number; startY: number; base: { left: number; top: number } } | null>(null)

  // Load the atlas metadata once.
  useEffect(() => {
    let stale = false
    void fetch(`${ASSETS}/atlas.json`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: AtlasMeta | null) => { if (!stale && value !== null) setMeta(value) })
      .catch(() => { /* keep null; the overlay stays hidden */ })
    return () => { stale = true }
  }, [])

  // Mood-driven speech bubble: pick a random built-in line per mood, rotate
  // while thinking, idle occasionally chats on a lazy timer. Session text is
  // deliberately NOT shown — the pet speaks its own lines.
  const moodForBubble: PetMood = moodSnap !== undefined && VALID_MOODS.includes(moodSnap.mood)
    ? (moodSnap.mood as PetMood)
    : 'idle'
  const lastLineRef = useRef<string>('')
  useEffect(() => {
    const mood = moodForBubble
    const pickLine = (): string => {
      const pool = BUBBLE_LINES[mood]
      if (pool === undefined || pool.length === 0) return ''
      let line = pool[Math.floor(Math.random() * pool.length)]
      if (pool.length > 1 && line === lastLineRef.current) {
        line = pool[(pool.indexOf(line) + 1) % pool.length]
      }
      lastLineRef.current = line
      return line
    }
    const timers: number[] = []
    const later = (fn: () => void, ms: number): void => { timers.push(window.setTimeout(fn, ms)) }
    const clear = (): void => {
      for (const t of timers) window.clearTimeout(t)
      timers.length = 0
    }

    if (mood === 'think') {
      // While the model works: show a line now and rotate every few seconds.
      setBubble(pickLine())
      const rotate = (): void => { setBubble(pickLine()); later(rotate, THINK_ROTATE_MS) }
      later(rotate, THINK_ROTATE_MS)
    } else if (mood === 'happy' || mood === 'sad' || mood === 'wave') {
      setBubble(pickLine())
      later(() => setBubble(null), MOOD_LINE_HOLD_MS)
    } else if (mood === 'sleep') {
      setBubble(pickLine())
      later(() => setBubble(null), SLEEP_LINE_HOLD_MS)
    } else {
      // idle: occasionally chat on a lazy, randomized timer.
      const schedule = (): void => {
        later(() => {
          setBubble(pickLine())
          later(() => setBubble(null), IDLE_LINE_HOLD_MS)
          schedule()
        }, IDLE_LINE_GAP_MIN + Math.floor(Math.random() * (IDLE_LINE_GAP_MAX - IDLE_LINE_GAP_MIN)))
      }
      later(schedule, IDLE_FIRST_GAP_MS)
    }
    return clear
  }, [moodForBubble])

  // ---- Derived values (before all early returns; safe with empty frames) ----
  const enabled = config?.enabled === true
  const mood: PetMood = moodSnap !== undefined && VALID_MOODS.includes(moodSnap.mood)
    ? (moodSnap.mood as PetMood)
    : 'idle'

  let frames: number[] = []
  if (meta !== null && enabled) {
    const configured = parseFrames(
      (config?.animations as unknown as Record<string, string> | undefined)?.[mood],
      meta.cells.length,
    )
    frames = configured.length > 0
      ? configured
      : ((meta.defaultAnimations[mood] ?? []) as number[]).filter((n) => n >= 1 && n <= meta.cells.length)
  }

  // Frame animation ticker (always mounted; no-ops without frames).
  useEffect(() => {
    if (meta === null || frames.length <= 1) { setFrameIndex(0); return }
    let raf = 0
    let last = performance.now()
    let acc = 0
    const dur = Math.max(30, (FRAME_MS[mood] ?? 150) / Math.max(0.1, config?.speed ?? 1))
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      const dt = now - last
      last = now
      acc += dt
      if (acc >= dur) {
        acc = acc % dur
        setFrameIndex((i) => (i + 1) % frames.length)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, mood, config?.speed, frames.length])

  const visible = meta !== null && enabled && frames.length > 0

  const cells = frames.map((n) => meta !== null ? meta.cells[n - 1] : undefined).filter((c): c is AtlasCell => c !== undefined)
  const boxW = cells.length > 0 ? Math.max(...cells.map((c) => c.w)) : 1
  const boxH = cells.length > 0 ? Math.max(...cells.map((c) => c.h)) : 1
  const scale = config !== undefined ? config.size / boxH : 1
  const boxWpx = boxW * scale
  const boxHpx = boxH * scale

  const rest = config !== undefined ? restingPosition(config, boxWpx, boxHpx) : { left: 0, top: 0 }
  const pos = dragPos ?? rest

  const onPointerDown = useCallback((event: RPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.preventDefault()
    const base = dragPos ?? rest
    dragRef.current = { startX: event.clientX, startY: event.clientY, base }
    ;(event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId)
  }, [dragPos, rest])

  const onPointerMove = useCallback((event: RPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    if (d === null) return
    const left = d.base.left + (event.clientX - d.startX)
    const top = d.base.top + (event.clientY - d.startY)
    setDragPos({ left, top })
  }, [])

  const onPointerUp = useCallback((): void => {
    const d = dragRef.current
    dragRef.current = null
    if (d === null || props.petScope === undefined) return
    const posNow = dragPos ?? d.base
    const vw = window.innerWidth
    const vh = window.innerHeight
    const snap = 56
    const x = posNow.left
    const y = posNow.top
    const nearRight = vw - (x + boxWpx) <= snap
    const nearLeft = x <= snap
    const nearBottom = vh - (y + boxHpx) <= snap
    const nearTop = y <= snap
    let corner = 'custom'
    let offsetX = Math.max(0, Math.round(x))
    let offsetY = Math.max(0, Math.round(y))
    if (nearRight && nearBottom) { corner = 'bottom-right'; offsetX = Math.max(0, Math.round(vw - (x + boxWpx))); offsetY = Math.max(0, Math.round(vh - (y + boxHpx))) }
    else if (nearLeft && nearBottom) { corner = 'bottom-left'; offsetX = Math.max(0, Math.round(x)); offsetY = Math.max(0, Math.round(vh - (y + boxHpx))) }
    else if (nearRight && nearTop) { corner = 'top-right'; offsetX = Math.max(0, Math.round(vw - (x + boxWpx))); offsetY = Math.max(0, Math.round(y)) }
    else if (nearLeft && nearTop) { corner = 'top-left'; offsetX = Math.max(0, Math.round(x)); offsetY = Math.max(0, Math.round(y)) }
    void props.petScope.set('corner', corner)
    void props.petScope.set('offsetX', offsetX)
    void props.petScope.set('offsetY', offsetY)
    setDragPos(null)
  }, [dragPos, boxWpx, boxHpx, props.petScope])

  if (!visible) return null

  const cell = cells[Math.min(frameIndex % cells.length, cells.length - 1)]
  const cellW = cell.w * scale
  const cellH = cell.h * scale

  const frameStyle: CSSProperties = {
    position: 'absolute',
    left: Math.round((boxWpx - cellW) / 2),
    bottom: 0,
    width: Math.round(cellW),
    height: Math.round(cellH),
    backgroundImage: `url(${ASSETS}/${meta!.image})`,
    backgroundSize: `${meta!.width * scale}px ${meta!.height * scale}px`,
    backgroundPosition: `-${cell.x * scale}px -${cell.y * scale}px`,
    backgroundRepeat: 'no-repeat',
    pointerEvents: 'none',
  }

  const wrapper: CSSProperties = {
    position: 'fixed',
    left: pos.left,
    top: pos.top,
    width: boxWpx,
    height: boxHpx,
    zIndex: 2147483000,
    cursor: 'grab',
    touchAction: 'none',
    userSelect: 'none',
    opacity: config!.opacity ?? 1,
  }

  return (
    <div style={wrapper} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp} role="img" aria-label="DSH 宠物小狐狸" data-dsh-pet
      onClick={() => { if (bubble !== null) setBubble(null) }}>
      <div style={frameStyle} />
      {bubble !== null ? (() => {
        const cleaned = cleanMarkdown(bubble)
        if (cleaned === '') return null
        return (
          <div>
            <div style={{
              position: 'absolute', left: 20, bottom: boxHpx + 1, width: 0, height: 0,
              borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
              borderTop: '8px solid rgba(24,26,36,0.96)',
            }} />
            <div style={{
              position: 'absolute', left: 0, bottom: boxHpx + 9, maxWidth: 300, maxHeight: 140,
              overflowY: 'auto', padding: '8px 12px',
              background: 'rgba(24,26,36,0.96)', color: '#e8eaf2', fontSize: 12, lineHeight: 1.7,
              borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.08)',
              wordBreak: 'break-word', whiteSpace: 'pre-line',
            }}>{cleaned}</div>
          </div>
        )
      })() : null}
    </div>
  )
}

function restingPosition(config: PetSettingsClient, boxW: number, boxH: number): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const ox = config.offsetX ?? 16
  const oy = config.offsetY ?? 16
  switch (config.corner) {
    case 'top-left': return { left: ox, top: oy }
    case 'top-right': return { left: Math.max(0, vw - boxW - ox), top: oy }
    case 'bottom-left': return { left: ox, top: Math.max(0, vh - boxH - oy) }
    case 'custom': return { left: Math.min(Math.max(ox, 0), vw - boxW), top: Math.min(Math.max(oy, 0), vh - boxH) }
    case 'bottom-right':
    default:
      return { left: Math.max(0, vw - boxW - ox), top: Math.max(0, vh - boxH - oy) }
  }
}
