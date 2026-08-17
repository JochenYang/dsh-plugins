/**
 * Pet config source: an HTTP-backed reactive store over /_dsh/pet/config.
 *
 * The desktop app isolates the browser-visible settings store from the plugin
 * host, so the pet preferences travel through a dedicated route instead of
 * the settings namespace. The snapshot shape ({ status, value }) mirrors the
 * settings scope, keeping the overlay/settings components unchanged.
 */
import type { PetReactionsClient, PetSettingsClient } from './types'

const CONFIG_ROUTE = '/_dsh/pet/config'

export interface PetConfigSnapshot {
  status: 'loading' | 'ready' | 'error'
  value: PetSettingsClient | undefined
}

export interface PetConfigSource {
  getSnapshot(): PetConfigSnapshot
  subscribe(fn: () => void): () => void
  /** Merge one scalar field (or a whole nested object) into the config and persist. */
  set(field: string, value: unknown): Promise<void>
}

function defaultPetSettings(): PetSettingsClient {
  return {
    enabled: true,
    size: 120,
    corner: 'bottom-right',
    offsetX: 16,
    offsetY: 16,
    speed: 1,
    opacity: 1,
    reactions: { streaming: true, complete: true, error: true, sentiment: true },
    animations: {
      idle: '4,5,6',
      happy: '7,8,11',
      sad: '10',
      think: '16,17,18',
      sleep: '22,23,24,25',
      wave: '11,8',
    },
  }
}

export function createPetConfigSource(): PetConfigSource {
  let snapshot: PetConfigSnapshot = { status: 'loading', value: undefined }
  const listeners = new Set<() => void>()

  const emit = (): void => {
    for (const fn of [...listeners]) {
      try { fn() } catch { /* contain subscriber failures */ }
    }
  }
  const publish = (next: PetConfigSnapshot): void => {
    if (next !== snapshot) {
      snapshot = next
      emit()
    }
  }

  async function refresh(): Promise<void> {
    try {
      const response = await fetch(CONFIG_ROUTE, { credentials: 'same-origin' })
      const body = await response.json() as { ok?: boolean; value?: PetSettingsClient }
      if (response.ok && body.ok === true && body.value !== undefined) {
        publish({ status: 'ready', value: body.value })
        return
      }
      publish({ status: 'error', value: undefined })
    } catch {
      publish({ status: 'error', value: undefined })
    }
  }

  function mergeField(current: PetSettingsClient | undefined, field: string, value: unknown): PetSettingsClient {
    const base: Record<string, unknown> = { ...(current ?? defaultPetSettings()) }
    base[field] = value
    return base as unknown as PetSettingsClient
  }

  async function write(next: PetSettingsClient): Promise<void> {
    // Optimistic publish, then reconcile with the host response.
    publish({ status: 'ready', value: next })
    try {
      const response = await fetch(CONFIG_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      })
      const body = await response.json() as { ok?: boolean; value?: PetSettingsClient }
      if (response.ok && body.ok === true && body.value !== undefined) {
        publish({ status: 'ready', value: body.value })
      } else {
        void refresh()
      }
    } catch {
      // Network failure: keep the optimistic value; a later refresh reconciles.
    }
  }

  void refresh()

  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    async set(field, value) {
      await write(mergeField(snapshot.value, field, value))
    },
  }
}

/** Reactions getter used by the mood tracker. */
export function reactionsOf(snapshot: PetConfigSnapshot): PetReactionsClient {
  if (snapshot.status === 'ready' && snapshot.value?.reactions !== undefined) return snapshot.value.reactions
  return defaultPetSettings().reactions
}
