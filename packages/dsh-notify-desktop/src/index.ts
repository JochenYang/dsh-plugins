/**
 * Desktop audio + push notifications: plays a sound (and optionally posts to
 * ntfy) when a turn runs longer than the configured threshold, when a
 * background job settles, and when a tool call fails. Success and error events
 * use different sounds; player and push failures are logged, never thrown.
 *
 * Playback spawns a short-lived platform player (PowerShell `SoundPlayer` or
 * the system exclamation on Windows, `afplay` on macOS, `aplay` on Linux)
 * detached from the harness lifecycle.
 */

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { SessionSeq, TOOL_NOT_STARTED, TOOL_OUTCOME_UNKNOWN, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { JobEvent } from '@deepseek-ai/dsh-jobs'

/** Cordis plugin name. */
export const name = 'dsh-notify-desktop'

/** Deployment choices for the notifier. */
export interface Config {
  /** Success sound file; empty means `<dshHome>/sounds/finish.wav`. */
  successSoundPath: string
  /** Error sound file; empty means the Windows system exclamation sound. */
  errorSoundPath: string
  /** ntfy topic; empty disables push notifications. */
  ntfyTopic: string
  /** ntfy server base URL. */
  ntfyServer: string
  /** A turn whose duration reaches this many milliseconds triggers a notification. */
  minTurnDurationMs: number
  /** Notify when a background job settles. */
  notifyOnJobDone: boolean
  /** Notify when a tool call fails. */
  notifyOnToolError: boolean
  /** Ignore further notifications for this many milliseconds after the last one. */
  cooldownMs: number
}

/** Schemastery configuration for the notifier. */
export const Config: z<Config> = z.object({
  successSoundPath: z.string().default(''),
  errorSoundPath: z.string().default(''),
  ntfyTopic: z.string().default(''),
  ntfyServer: z.string().default('https://ntfy.sh'),
  minTurnDurationMs: z.number().required(),
  notifyOnJobDone: z.boolean().required(),
  notifyOnToolError: z.boolean().required(),
  cooldownMs: z.number().required(),
})

/** One audible notification: a sound file or the system exclamation. */
export type Sound = { kind: 'file'; path: string } | { kind: 'exclamation' }

/**
 * Notification sources. Each owns a cooldown slot, so one source's sound can
 * never suppress another's. The single shared timestamp this replaces let a
 * background job, a tool error, or a subagent turn swallow the main turn's
 * completion sound — reported as "the task finished but nothing played".
 */
type Channel = 'turn' | 'turn-child' | 'tool' | 'job'

/** @returns the platform's player command and arguments for one sound. */
function playerCommand(sound: Sound): { command: string; args: string[] } {
  if (sound.kind === 'exclamation') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', '[System.Media.SystemSounds]::Exclamation.Play()'],
    }
  }
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command',
        `try { (New-Object System.Media.SoundPlayer '${sound.path.replace(/'/g, "''")}').PlaySync() } catch { Write-Error $_.Exception.Message; exit 1 }`],
    }
  }
  if (process.platform === 'darwin') return { command: 'afplay', args: [sound.path] }
  return { command: 'aplay', args: ['-q', sound.path] }
}

/**
 * Play one notification sound, detached from the harness process. Missing
 * files, spawn failures, and non-zero player exits are reported through
 * `logError` instead of throwing.
 * @param sound - the file or system sound to play.
 * @param logError - receives diagnostics for silent failures.
 */
export function playSound(sound: Sound, logError: (message: string) => void): void {
  if (sound.kind === 'file' && !existsSync(sound.path)) {
    logError(`notify sound file missing: ${sound.path}`)
    return
  }
  const { command, args } = playerCommand(sound)
  const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  child.on('error', error => logError(`notify player spawn failed: ${error.message}`))
  child.on('exit', code => {
    if (code !== 0) logError(`notify player exited ${code}: ${stderr.trim()}`)
  })
  child.unref()
}

/**
 * Post one push notification to an ntfy server, fire-and-forget.
 * @param baseUrl - ntfy server base URL.
 * @param topic - the subscribed topic.
 * @param title - notification title.
 * @param message - notification body.
 * @param logError - receives push diagnostics.
 */
export function pushNtfy(
  baseUrl: string,
  topic: string,
  title: string,
  message: string,
  logError: (message: string) => void,
): void {
  void fetch(`${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: { Title: title, Priority: '3' },
    body: message,
  }).catch(error => logError(`ntfy push failed: ${(error as Error).message}`))
}

/**
 * Register the session/event and jobs listeners that drive notifications.
 * @param ctx - Cordis context.
 * @param config - deployment's sound paths, ntfy topic, and thresholds.
 */
export function apply(ctx: Context, config: Config): void {
  const home = resolveDshHome()
  // 包内自带默认铃声：首次安装时复制到 <dshHome>/sounds/finish.wav（之后用户可自行覆盖该文件）
  const homeSound = join(home, 'sounds', 'finish.wav')
  const packagedSound = join(dirname(fileURLToPath(import.meta.url)), '..', 'sounds', 'finish.wav')
  if (!existsSync(homeSound) && existsSync(packagedSound)) {
    try {
      mkdirSync(dirname(homeSound), { recursive: true })
      copyFileSync(packagedSound, homeSound)
    } catch (error) {
      ctx.logger('dsh-notify-desktop').warn(`notify bundled sound copy failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const successSound: Sound = config.successSoundPath
    ? { kind: 'file', path: config.successSoundPath }
    : { kind: 'file', path: homeSound }
  const errorSound: Sound = config.errorSoundPath
    ? { kind: 'file', path: config.errorSoundPath }
    : { kind: 'exclamation' }
  const logError = (message: string): void => {
    ctx.logger('dsh-notify-desktop').warn(message)
  }
  // One timestamp per channel. A shared one let whichever sound fired first —
  // a background job, a tool error, a subagent turn — swallow the main turn's
  // completion sound for the next cooldownMs.
  const lastNotifiedAt = new Map<Channel, number>()
  const notify = (channel: Channel, kind: 'success' | 'error', title: string, message: string): void => {
    const now = Date.now()
    if (now - (lastNotifiedAt.get(channel) ?? 0) < config.cooldownMs) return
    lastNotifiedAt.set(channel, now)
    playSound(kind === 'success' ? successSound : errorSound, logError)
    if (config.ntfyTopic !== '') pushNtfy(config.ntfyServer, config.ntfyTopic, title, message, logError)
  }

  /**
   * Resolve a turn's start time from the log, for turns this instance did not
   * observe start.
   *
   * `turnStarts` only holds turns that began after the plugin mounted. A hot
   * reload (the base bundle's `hmr` row) or a session resumed mid-turn empties
   * that map while the log still records the start, so the log is the
   * authority and the map is only the fast path.
   * @param session - the session that just closed a turn.
   * @param closingTurn - the turn number whose closer was just appended.
   * @returns the recorded start in epoch milliseconds, or undefined when the log has none.
   */
  const loggedTurnStart = (session: Session, closingTurn: number): number | undefined => {
    for (let seq = session.seq - 2; seq >= 0; seq--) {
      const prior = session.eventAt(SessionSeq(seq))
      if (prior === undefined) continue
      // Meeting another turn's closer means we walked past this turn's
      // territory — its start is not in the log this session can see.
      if (prior.type === 'turn/end') return undefined
      if (prior.type === 'turn/start' && prior.data.turn === closingTurn) return prior.time
    }
    return undefined
  }

  const turnStarts = new Map<string, number>()
  ctx.on('session/event', (_session, event: SessionEvent) => {
    const sessionId = String(_session.id)
    // Child sessions (subagents) ring on their own channel: they close far more
    // often than the main session and would otherwise spend its cooldown.
    const channel: Channel = (_session.header.delegationDepth ?? 0) > 0 ? 'turn-child' : 'turn'
    if (event.type === 'turn/start') {
      turnStarts.set(sessionId, event.time)
    } else if (event.type === 'turn/end') {
      const startedAt = turnStarts.get(sessionId) ?? loggedTurnStart(_session, event.data.turn)
      turnStarts.delete(sessionId)
      if (startedAt === undefined) return
      const elapsed = event.time - startedAt
      if (elapsed < config.minTurnDurationMs) return
      const seconds = Math.round(elapsed / 1000)
      // A turn that ended in failure is not a success: the success chime told
      // the user "done" for a turn that broke. Cancellation stays on the
      // success chime — the user caused it and is still watching the screen.
      const failed = event.data.reason.kind === 'error'
      notify(channel, failed ? 'error' : 'success',
        failed ? 'DSH 回合失败' : 'DSH 回合结束', `回合耗时 ${seconds}s`)
    } else if (config.notifyOnToolError && event.type === 'tool/result' && event.data.error !== undefined) {
      // A failed or aborted step closes through ToolCallRecovery, which appends
      // synthetic results for calls whose outcome was never recorded. Those
      // report the harness's own interrupted work — the model already sees them
      // in the next step — so they are not a tool failure the user must hear.
      const { code } = event.data.error
      if (code === TOOL_NOT_STARTED || code === TOOL_OUTCOME_UNKNOWN) return
      notify('tool', 'error', 'DSH 工具失败', `${event.data.error.name} (${code})`)
    }
  })

  ctx.inject(['jobs'], function notifyOnJobs(jobsCtx) {
    // The jobs seam exposes one event stream; `settled` is the terminal commit.
    // `owners: 'all'` is the process-level filter — this bundle is mounted at the
    // profile layer and has no session scope of its own.
    const onJobEvent: (event: JobEvent) => void = (event) => {
      if (!config.notifyOnJobDone || event.type !== 'settled') return
      // A teardown settlement force-fails whatever was still running when its
      // owner (or the whole registry) was disposed. That is cleanup, not an
      // outcome the user is waiting on — reporting it would turn every session
      // disposal into a burst of failure alerts.
      if (event.cause === 'teardown') return
      // Every shell tool call registers its process as a job and waits on the
      // foreground ones, so the result already reaches the model. The registry
      // marks those settlements `awaited` precisely so a completion reporter
      // skips them; notifying for them rings on every command a turn runs.
      if (event.awaited) return
      const { id, label, status, detail } = event.job
      const suffix = detail !== undefined ? ` (${detail})` : ''
      notify('job', status === 'completed' ? 'success' : 'error', 'DSH 后台任务结束',
        `${label} [${id}] — ${status}${suffix}`)
    }
    jobsCtx.jobs.events.subscribe({ owners: 'all' }, onJobEvent)
  })
}
