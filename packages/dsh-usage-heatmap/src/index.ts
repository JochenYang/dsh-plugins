/**
 * dsh-usage-heatmap — DSH 用量热力图插件。
 *
 * 数据获取：监听会话事件流（assistant/message 携带适配器上报的 TokenUsage），
 * 并用会话持久化层的只读 inspect() 回填历史日志；两者共用按会话水位线折叠，
 * 天然幂等。聚合结果通过 /_dsh/usage-heatmap 路由（JSON API + 单文件页面）
 * 提供给浏览器；客户端 bundle 在侧栏加一个"用量"入口，用悬浮面板 iframe
 * 内嵌同一页面。
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { PricingEntry } from './aggregate.js'
import { runBackfill } from './backfill.js'
import { foldLiveEvent } from './fold.js'
import { registerUsageRoutes } from './routes.js'
import { UsageStore } from './store.js'

/** Cordis plugin name. */
export const name = 'dsh-usage-heatmap'

/** Deployment choices. */
export interface Config {
  /** Storage directory; empty means `<dshHome>/storages/dsh-usage-heatmap`. */
  storePath: string
  /** Fold all persisted session logs on plugin start. */
  backfillOnStart: boolean
  /** Re-scan persisted sessions every N minutes (0 disables). */
  rescanMinutes: number
  /** Per-1M-token USD prices by exact provider/model; unmatched models cost 0. */
  pricing: PricingEntry[]
}

/** Schemastery configuration. */
export const Config: z<Config> = z.object({
  storePath: z.string().default(''),
  backfillOnStart: z.boolean().default(true),
  rescanMinutes: z.number().default(5),
  pricing: z.array(z.object({
    provider: z.string().required(),
    model: z.string().required(),
    input: z.number().required(),
    output: z.number().required(),
    cacheRead: z.number().required(),
    cacheWrite: z.number().required(),
  })).default([]),
})

/** Services the fiber waits for before apply. */
export const inject = ['webServer', 'sessionPersistence']

/**
 * Register the heatmap plugin: live usage capture, one startup backfill,
 * an optional periodic rescan, and the HTTP routes.
 * @param ctx - Cordis context.
 * @param config - storage path, backfill policy, and pricing.
 */
export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger(name)
  const dir = config.storePath !== ''
    ? config.storePath
    : join(resolveDshHome(), 'storages', 'dsh-usage-heatmap')

  const store = new UsageStore({ dir, log: message => log.warn(message) })
  store.load()
  log.info(`usage store: ${store.size} row(s) loaded from ${dir}`)

  // Live capture: every assistant message with provider-reported usage.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    try {
      foldLiveEvent(store, session, event)
    } catch (error) {
      log.warn(`usage capture failed: ${(error as Error).message}`)
    }
  })

  // Historical backfill (async; never blocks plugin activation).
  if (config.backfillOnStart) {
    void runBackfill(ctx, store, message => log.info(message)).catch(error => {
      log.warn(`usage backfill failed: ${(error as Error).message}`)
    })
  }

  // Periodic rescan covers plugin reloads and sessions written by other hosts.
  if (config.rescanMinutes > 0) {
    const timer = setInterval(() => {
      void runBackfill(ctx, store, message => log.info(message)).catch(error => {
        log.warn(`usage rescan failed: ${(error as Error).message}`)
      })
    }, config.rescanMinutes * 60_000)
    ctx.effect(() => {
      return () => { clearInterval(timer) }
    }, 'dsh-usage-heatmap: rescan timer')
  }

  ctx.effect(() => {
    return () => { store.dispose() }
  }, 'dsh-usage-heatmap: store')

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposeRoutes = registerUsageRoutes(webCtx.webServer, store, { pricing: config.pricing })
      return disposeRoutes
    }, 'dsh-usage-heatmap: web routes')
  })
}
