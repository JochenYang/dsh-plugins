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
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { JobDoneListener } from '@deepseek-ai/dsh-jobs'

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
  let lastNotifiedAt = 0
  const notify = (kind: 'success' | 'error', title: string, message: string): void => {
    const now = Date.now()
    if (now - lastNotifiedAt < config.cooldownMs) return
    lastNotifiedAt = now
    playSound(kind === 'success' ? successSound : errorSound, logError)
    if (config.ntfyTopic !== '') pushNtfy(config.ntfyServer, config.ntfyTopic, title, message, logError)
  }

  const turnStarts = new Map<string, number>()
  ctx.on('session/event', (_session, event: SessionEvent) => {
    const sessionId = String(_session.id)
    if (event.type === 'turn/start') {
      turnStarts.set(sessionId, Date.now())
    } else if (event.type === 'turn/end') {
      const startedAt = turnStarts.get(sessionId)
      turnStarts.delete(sessionId)
      if (startedAt !== undefined && Date.now() - startedAt >= config.minTurnDurationMs) {
        const seconds = Math.round((Date.now() - startedAt) / 1000)
        notify('success', 'DSH 回合结束', `回合耗时 ${seconds}s`)
      }
    } else if (config.notifyOnToolError && event.type === 'tool/result' && event.data.error !== undefined) {
      notify('error', 'DSH 工具失败', `${event.data.error.name} (${event.data.error.code})`)
    }
  })

  ctx.inject(['jobs'], (jobsCtx) => {
    const onJobDone: JobDoneListener = (snapshot) => {
      if (!config.notifyOnJobDone) return
      const ok = snapshot.status === 'completed'
      const detail = snapshot.detail !== undefined ? ` (${snapshot.detail})` : ''
      notify(ok ? 'success' : 'error', 'DSH 后台任务结束',
        `${snapshot.label} [${snapshot.id}] — ${snapshot.status}${detail}`)
    }
    jobsCtx.jobs.onJobDone(onJobDone)
  })
}
