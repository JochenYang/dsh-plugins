/**
 * dsh-pet browser half: runs the HTTP-backed pet config source, the mood
 * tracker, and registers the floating overlay (shell.overlay) plus the
 * settings page (settings.section).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: conversation/layout Context merges used by components.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: settings.section SlotMap declaration lives in ui-settings.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createMoodTracker } from './mood'
import { PetOverlay } from './PetOverlay'
import { PetSettingsSection } from './PetSettingsSection'
import { createPetConfigSource, reactionsOf } from './config-source'

/** Required client services. */
export const inject = ['slots', 'sessions']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const log = ctx.logger?.('dsh-pet')
    const config = createPetConfigSource()

    // Keep the tracker's reaction toggles live from the config source.
    let reactions = reactionsOf(config.getSnapshot())
    const syncReactions = (): void => { reactions = reactionsOf(config.getSnapshot()) }
    const offConfig = config.subscribe(syncReactions)

    const mood = createMoodTracker(ctx, () => reactions)

    const disposeOverlay = ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-pet',
      order: 1000,
      inject: () => ({ hooks: { petConfig: config, petMood: mood }, petScope: config }),
    }, PetOverlay)

    const disposeSection = ctx.slots.register({
      name: 'settings.section',
      id: 'pet',
      order: 40,
      label: '宠物',
      inject: () => ({ hooks: { petConfig: config }, petScope: config }),
    }, PetSettingsSection)

    log?.info?.('dsh-pet: overlay + settings section registered')
    return () => {
      disposeSection()
      disposeOverlay()
      offConfig()
      mood.dispose()
      log?.info?.('dsh-pet: browser half disposed')
    }
  }, 'dsh-pet: browser half')
}
