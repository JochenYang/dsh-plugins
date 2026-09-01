/**
 * dsh-usage-heatmap browser half: one "用量统计" settings section rendered as
 * a NATIVE React surface (no iframe), following the dsh-at-file pattern:
 * hand-written stylesheet over the shared `--dsw-alias-*` design tokens,
 * registered into the settings shell's `settings.section` slot.
 *
 * The `settings.section` slot is declared by ui-settings-general at runtime;
 * `ctx.slots.inject` waits for the declaration before registering, so plugin
 * load order cannot race the settings shell.
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: ctx.slots (SlotRegistry) Context merge lives in ui-renderer.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { adoptStyles } from './styles.js'
import { UsageSection } from './UsageSection.js'

/** Client services the fiber waits for before apply (`ctx.slots` requires inject). */
export const inject = ['slots']

export function apply(ctx: Context): void {
  adoptStyles()
  // Wait for the settings shell's section declaration before registering.
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'usage-heatmap',
        order: 200,
        label: '用量统计',
      },
      UsageSection,
    ),
  )
}
