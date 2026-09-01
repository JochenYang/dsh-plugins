/**
 * Pet mood tracker: adapts the DSH 0.1.2-alpha session architecture.
 *
 * The old client runtime exposed a node-style Conversation snapshot (nodes /
 * partial / lastAgentError) on each session binding. The 0.1.2-alpha kernel
 * removed that surface: `SessionSnapshot` carries only lifecycle state
 * (running, lastAgentError), and conversation nodes live in the conversation
 * views. The tracker now reads two channels off the same `ctx.sessions`
 * binding:
 *
 * - `binding.eventSource` — append deltas of the session event window
 *   (turn/start, assistant/chunk, assistant/message, turn/end …); the mood
 *   derives from the live tail only, history windows become the baseline.
 * - `binding.session` — lifecycle snapshot as a fallback (running / error),
 *   which also covers a turn already streaming when the tracker attaches.
 *
 * Reactions:
 * - streaming reply          -> think (thinking/listening animation)
 * - reply completed          -> classify the final text (wave/happy/sad) or happy
 * - turn ended in an error   -> sad
 * - otherwise                -> idle (held moods decay back to idle)
 *
 * The tracker is a tiny uSES-compatible observable; the overlay consumes it
 * through the inject `usePetMood` hook.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  SessionEventWindow, SessionSnapshot,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import type { PetMood, PetReactionsClient } from './types'

export interface MoodSnapshot {
  mood: PetMood
  /** Latest finalized assistant text (trimmed), for the speech bubble. */
  text: string
  /** Whether a reply is streaming tokens right now. */
  streaming: boolean
  running: boolean
}

export interface MoodTracker {
  subscribe(fn: () => void): () => void
  getSnapshot(): MoodSnapshot
  dispose(): void
}

/** Reaction toggles are read live from the pet settings. */
export type ReactionsProvider = () => PetReactionsClient

const IDLE: MoodSnapshot = Object.freeze({ mood: 'idle', text: '', streaming: false, running: false })

function classify(text: string): PetMood {
  const t = text.trim()
  if (t === '') return 'happy'
  if (/^(你好|哈喽|嗨|hi|hello|早上好|下午好|晚上好|来了|在的|欢迎|welcome)/iu.test(t)) return 'wave'
  if (/(抱歉|对不起|遗憾|失败|报错|错误|出错|无法|不能|不行|出错|有问题|sorry|fail|error|unable|mistake)/iu.test(t)) return 'sad'
  if (/(太好了|太棒|开心|高兴|成功|完成|搞定|解决|没问题|恭喜|谢谢|感谢|好耶|完美|合作愉快|thanks|great|awesome|perfect|done|success)/iu.test(t)) return 'happy'
  return 'happy'
}

/** Join the visible text blocks of an assistant message (dsh-llm ContentBlock). */
function assistantText(content: readonly { type: string; text?: string }[]): string {
  let out = ''
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') out += block.text
  }
  return out.trim()
}

function truncate(value: string): string {
  return value.length > 120 ? value.slice(0, 120) + '…' : value
}

/** Hold durations per mood before decaying to idle. */
const HOLD_MS: Record<PetMood, number> = {
  idle: 0,
  think: Number.POSITIVE_INFINITY, // held while streaming; released below
  happy: 3500,
  sad: 5500,
  wave: 3500,
  sleep: 0, // sleep is session-driven, not a timed hold
}

export function createMoodTracker(ctx: Context, reactions: ReactionsProvider): MoodTracker {
  let snapshot: MoodSnapshot = IDLE
  let mood: PetMood = 'idle'
  let moodUntil = 0
  let text = ''
  let streaming = false
  let running = false
  let wasRunning = false
  /** Event-window revision already absorbed; -1 = no baseline yet. */
  let revision = -1
  let curSession: { id: SessionId; unsubSnap: () => void; unsubEvent: () => void } | undefined
  const listeners = new Set<() => void>()
  let closed = false

  const emit = (): void => {
    const next: MoodSnapshot = { mood, text, streaming, running }
    if (snapshot === next) return
    snapshot = next
    for (const fn of [...listeners]) {
      try { fn() } catch { /* contain subscriber failures */ }
    }
  }

  const setMood = (next: PetMood): void => {
    if (mood === next) return
    mood = next
    emit()
  }

  // ---- Event channel: derive mood from the live window tail ----
  const applyWindow = (window: SessionEventWindow): void => {
    // Baseline: first observation, or a non-contiguous revision (reconnect /
    // history reload) — history is never replayed into the pet.
    if (revision === -1 || window.revision !== revision + 1 || window.change.kind === 'replace') {
      revision = window.revision
      return
    }
    revision = window.revision
    if (window.change.kind !== 'append') return
    for (const entry of window.change.entries) {
      if (entry.type === 'event') applyEvent(entry.event)
    }
  }

  const applyEvent = (event: SessionEvent): void => {
    const now = Date.now()
    const r = reactions()
    switch (event.type) {
      case 'turn/start':
        mood = 'think'
        moodUntil = Number.POSITIVE_INFINITY
        streaming = true
        emit()
        break
      case 'assistant/chunk':
        mood = 'think'
        moodUntil = Number.POSITIVE_INFINITY
        streaming = true
        emit()
        break
      case 'assistant/message': {
        streaming = false
        const value = assistantText(event.data.message.content)
        if (value !== '') text = truncate(value)
        if (event.data.interrupted === true) {
          // Turn was aborted mid-reply: gentle sad, or plain idle.
          setMood(r.error ? 'sad' : 'idle')
          if (mood === 'sad') moodUntil = now + HOLD_MS.sad
          emit()
        } else if (r.complete) {
          // Every finalized message re-classifies: the last reply owns the mood.
          mood = r.sentiment ? classify(value) : 'happy'
          moodUntil = now + HOLD_MS[mood]
          emit()
        }
        break
      }
      case 'tool/call':
      case 'tool/result':
        // Tooling is part of the running turn; the thinking hold continues.
        mood = 'think'
        moodUntil = Number.POSITIVE_INFINITY
        streaming = true
        emit()
        break
      case 'turn/end': {
        const kind = event.data.reason.kind
        streaming = false
        if (kind === 'error') {
          if (r.error) {
            mood = 'sad'
            moodUntil = now + HOLD_MS.sad
            emit()
          }
        } else if (kind === 'aborted') {
          if (r.error) {
            mood = 'sad'
            moodUntil = now + HOLD_MS.sad
            emit()
          } else {
            setMood('idle')
            emit()
          }
        } else {
          // completed / max-tokens / blocked / interrupted: release the hold.
          if (mood === 'think' && r.complete) {
            mood = 'happy'
            moodUntil = now + HOLD_MS.happy
            emit()
          } else if (mood === 'think') {
            setMood('idle')
            emit()
          }
        }
        break
      }
      default:
        break
    }
  }

  // ---- Snapshot channel: lifecycle fallback (also covers attach-in-flight) ----
  const applySnapshot = (snap: SessionSnapshot): void => {
    const now = Date.now()
    const r = reactions()
    wasRunning = running
    running = snap.running
    streaming = snap.running

    const err = snap.lastAgentError
    if (err !== null && r.error) {
      mood = 'sad'
      moodUntil = now + HOLD_MS.sad
      emit()
      return
    }

    if (r.streaming && snap.running) {
      // Covers a turn already streaming when the tracker attached (the event
      // baseline never replayed its turn/start).
      setMood('think')
      moodUntil = Number.POSITIVE_INFINITY
      emit()
      return
    }

    if (!snap.running && mood === 'think') {
      // Streaming ended without a finalized message event visible in this
      // window (e.g. cancelled turn): release the hold.
      if (r.complete) {
        mood = 'happy'
        moodUntil = now + HOLD_MS.happy
      } else {
        mood = 'idle'
      }
      emit()
    }

    if (mood !== 'idle' && mood !== 'think' && moodUntil <= now) {
      setMood('idle')
    }
  }

  const rewire = (): void => {
    const id = ctx.sessions.list.getSnapshot().current
    if (curSession !== undefined && curSession.id === id) return
    curSession?.unsubSnap()
    curSession?.unsubEvent()
    curSession = undefined
    revision = -1
    if (id === undefined) {
      mood = 'sleep'
      running = false
      streaming = false
      emit()
      return
    }
    const binding = ctx.sessions.binding(id)
    if (binding === undefined) return // retried on the next list emit
    // Session switch: reset per-session state so a stale mood/high-water mark
    // from the previous session cannot leak in.
    mood = 'idle'
    text = ''
    wasRunning = false
    running = false
    streaming = false
    emit()
    const unsubSnap = binding.session.subscribe(() => {
      if (!closed) applySnapshot(binding.session.getSnapshot())
    })
    const unsubEvent = binding.eventSource.subscribe(() => {
      if (!closed) applyWindow(binding.eventSource.getSnapshot())
    })
    curSession = { id, unsubSnap, unsubEvent }
    // Align to the live state (history windows become the baseline).
    applySnapshot(binding.session.getSnapshot())
    applyWindow(binding.eventSource.getSnapshot())
  }

  rewire()
  const offList = ctx.sessions.list.subscribe(rewire)

  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot: () => snapshot,
    dispose() {
      closed = true
      offList()
      curSession?.unsubSnap()
      curSession?.unsubEvent()
      curSession = undefined
    },
  }
}
