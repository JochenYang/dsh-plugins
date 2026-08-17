# dsh-notify-desktop

Desktop notification bundle for DeepSeek Harness: plays a sound and optionally posts to ntfy when a turn runs longer than the configured threshold, when a background job settles, and when a tool call fails. Success and error events use different sounds.

## Install

```powershell
pnpm run pack
pnpm dsh plugin --profile web add D:\codes\dsh-configure\dsh-notify-desktop\dsh-notify-desktop-0.2.0.tgz
```

The success sound lives at `C:\Users\Administrator\.dsh\sounds\finish.wav`; errors use the Windows system exclamation unless `errorSoundPath` is set.

## Config (cordis.patch.yml)

| Field | Default | Meaning |
|---|---|---|
| `successSoundPath` | `<dshHome>/sounds/finish.wav` | Sound for success events (long turn, completed job). |
| `errorSoundPath` | (empty) | Sound for error events; empty = Windows system exclamation. |
| `ntfyTopic` | (empty) | ntfy topic; empty disables push. `ntfyServer` defaults to `https://ntfy.sh`. |
| `minTurnDurationMs` | (required) | A turn reaching this duration triggers a notification. |
| `notifyOnJobDone` | (required) | Notify when a background job settles (success/error by outcome). |
| `notifyOnToolError` | (required) | Notify when a tool call fails. |
| `cooldownMs` | (required) | Minimum gap between notifications. |

Playback spawns a detached platform player (`powershell.exe` `SoundPlayer` / `SystemSounds.Exclamation` on Windows, `afplay` on macOS, `aplay` on Linux). Missing files, spawn failures, and non-zero player exits are logged via `ctx.logger('dsh-notify-desktop')`, never thrown.

## Develop

```powershell
pnpm install
pnpm typecheck    # types resolve from the deepseek-harness checkout's built declarations
pnpm build        # esbuild emits lib/index.js; @deepseek-ai/* stay external (resolved from the profile)
pnpm pack         # build + stage a dependency-free package.json and pack the tarball
```

Restart dsh after reinstalling. Uninstall: `pnpm dsh plugin --profile web remove dsh-notify-desktop`.

## Known limitations

- Turn tracking resets on plugin reload; an in-flight turn started before reload is not measured.
- ntfy uses priority 3 with the default public server unless `ntfyServer` is overridden; authentication is not supported.
- The cooldown is global across channels and event kinds, not per channel.
