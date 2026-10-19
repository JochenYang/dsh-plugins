# dsh-notify-desktop

Desktop notification bundle for DeepSeek Harness: plays a sound and optionally posts to ntfy when a turn runs longer than the configured threshold, when a background job settles, and when a tool call fails. Success and error events use different sounds.

## Install

```sh
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-notify-desktop
```

Restart dsh after installing.

## Sounds

- **Success sound**: the package bundles `sounds/finish.wav` (2.19 s chime); on first load it is copied to `<dshHome>/sounds/finish.wav` automatically. To use your own, place a file at that path (or set `successSoundPath`).
- **Error sound**: Windows system exclamation unless `errorSoundPath` is set.

## Config (cordis.patch.yml)

| Field | Default | Meaning |
|---|---|---|
| `successSoundPath` | `<dshHome>/sounds/finish.wav` | Sound for success events (long turn, completed job). |
| `errorSoundPath` | (empty) | Sound for error events; empty = Windows system exclamation. |
| `ntfyTopic` | (empty) | ntfy topic; empty disables push. `ntfyServer` defaults to `https://ntfy.sh`. |
| `minTurnDurationMs` | (required) | A turn reaching this duration triggers a notification. |
| `notifyOnJobDone` | (required) | Notify when a background job settles (success/error by outcome). |
| `notifyOnToolError` | (required) | Notify when a tool call fails. |
| `cooldownMs` | (required) | Minimum gap between notifications *from the same source*. Turns, subagent turns, tool failures, and job settlements each own a slot, so one source never mutes another. |

Playback spawns a detached platform player (`powershell.exe` `SoundPlayer` / `SystemSounds.Exclamation` on Windows, `afplay` on macOS, `aplay` on Linux). Missing files, spawn failures, and non-zero player exits are logged via `ctx.logger('dsh-notify-desktop')`, never thrown.

## Develop

```powershell
pnpm install
pnpm typecheck    # types resolve from the deepseek-harness checkout's built declarations
pnpm build        # esbuild emits lib/index.js; @deepseek-ai/* stay external (resolved from the profile)
pnpm pack         # build + stage a dependency-free package.json and pack the tarball
```

Restart dsh after reinstalling. Uninstall: `pnpm dsh plugin --profile web remove dsh-notify-desktop`.

## Behaviour notes

- A turn that ends in `error` plays the error sound with a 「DSH 回合失败」 title; a user-cancelled turn (`aborted`) keeps the success sound, because the user caused it and is still at the screen.
- Turn start times come from the session log, so a turn in flight across a hot reload (the base bundle's `hmr` row) is still measured. The in-memory map is only the fast path.

## Known limitations

- ntfy uses priority 3 with the default public server unless `ntfyServer` is overridden; authentication is not supported.
- The per-source cooldown lives in memory, so it resets on plugin reload (worst case: one extra sound).
