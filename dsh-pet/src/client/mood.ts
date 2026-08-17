/**
 * Pet mood tracker: watches the current session's conversation snapshot and
 * derives the pet expression from the LLM's activity:
 *
 * - streaming reply          -> think (thinking/listening animation)
 * - reply completed          -> classify the final text (wave/happy/sad) or happy
 * - turn ended in an error   -> sad
 * - otherwise                -> idle (held moods decay back to idle)
 *
 * The tracker is a tiny uSES-compatible observable; the overlay consumes it
 * through the inject `usePetMood` hook.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  AssistantBlock, AssistantMessageNode, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
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

function assistantText(blocks: readonly AssistantBlock[]): string {
  let out = ''
  for (const block of blocks) {
    if (block.kind === 'text') out += block.text
  }
  return out.trim()
}

function lastAssistantNode(snap: ConversationSnapshot): AssistantMessageNode | undefined {
  const nodes = snap.nodes
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node?.kind === 'assistant') return node
  }
  return undefined
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

export function createMoodTracker(ctx: ClientContext, reactions: ReactionsProvider): MoodTracker {
  let snapshot: MoodSnapshot = IDLE
  let mood: PetMood = 'idle'
  let moodUntil = 0
  let text = ''
  let streaming = false
  let running = false
  let wasRunning = false
  let processedSeq = -1
  let curSession: { id: string; unsub: () => void } | undefined
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

  const apply = (snap: ConversationSnapshot): void => {
    const now = Date.now()
    const r = reactions()
    wasRunning = running
    running = snap.running
    streaming = snap.running && snap.partial !== null && snap.partial !== undefined

    const err = snap.lastAgentError
    if (err !== null && r.error) {
      mood = 'sad'
      moodUntil = now + HOLD_MS.sad
      emit()
      return
    }

    if (r.streaming && snap.running) {
      mood = 'think'
      moodUntil = Number.POSITIVE_INFINITY
      emit()
      return
    }

    // Not streaming (or streaming reactions disabled): look for finalized content.
    const last = lastAssistantNode(snap)
    let handled = false
    if (last !== undefined && last.seq > processedSeq) {
      processedSeq = last.seq
      handled = true
      const value = assistantText(last.blocks)
      if (value !== '') text = truncate(value)
      if (last.interrupted === true) {
        // Turn was aborted mid-reply: gentle sad, or plain idle.
        if (r.error) {
          mood = 'sad'
          moodUntil = now + HOLD_MS.sad
        } else {
          mood = 'idle'
        }
        emit()
      } else if (r.complete) {
        mood = r.sentiment ? classify(value) : 'happy'
        moodUntil = now + HOLD_MS[mood]
        emit()
      } else if (mood === 'think') {
        mood = 'idle'
        emit()
      }
    } else if (!snap.running && mood === 'think') {
      // Streaming ended with no new finalized node in this window (e.g. a
      // cancelled turn): release the thinking hold.
      handled = true
      const hasTurnError = snap.nodes.some((n) => n?.kind === 'turn-error')
      if (hasTurnError && r.error) {
        mood = 'sad'
        moodUntil = now + HOLD_MS.sad
      } else if (r.complete) {
        mood = 'happy'
        moodUntil = now + HOLD_MS.happy
      } else {
        mood = 'idle'
      }
      emit()
    } else if (!snap.running && wasRunning && r.complete && !handled) {
      // Turn ended without a new finalized node in this window.
      mood = 'happy'
      moodUntil = now + HOLD_MS.happy
      emit()
    }

    if (mood !== 'idle' && mood !== 'think' && moodUntil <= now) {
      setMood('idle')
    }
  }

  const rewire = (): void => {
    const id = ctx.sessions.list.getSnapshot().current
    if (curSession !== undefined && curSession.id === id) return
    curSession?.unsub()
    curSession = undefined
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
    const snapshot0 = binding.session.getSnapshot()
    const last0 = lastAssistantNode(snapshot0)
    processedSeq = last0 !== undefined ? last0.seq : -1
    text = ''
    wasRunning = false
    mood = 'idle'
    emit()
    curSession = {
      id,
      unsub: binding.session.subscribe(() => {
        if (!closed) apply(binding.session.getSnapshot())
      }),
    }
    apply(binding.session.getSnapshot())
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
      curSession?.unsub()
      curSession = undefined
    },
  }
}
