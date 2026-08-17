// ../../dsh-plugins/packages/dsh-notify-desktop/src/index.ts
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
var name = "dsh-notify-desktop";
var Config = z.object({
  successSoundPath: z.string().default(""),
  errorSoundPath: z.string().default(""),
  ntfyTopic: z.string().default(""),
  ntfyServer: z.string().default("https://ntfy.sh"),
  minTurnDurationMs: z.number().required(),
  notifyOnJobDone: z.boolean().required(),
  notifyOnToolError: z.boolean().required(),
  cooldownMs: z.number().required()
});
function playerCommand(sound) {
  if (sound.kind === "exclamation") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", "[System.Media.SystemSounds]::Exclamation.Play()"]
    };
  }
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `try { (New-Object System.Media.SoundPlayer '${sound.path.replace(/'/g, "''")}').PlaySync() } catch { Write-Error $_.Exception.Message; exit 1 }`
      ]
    };
  }
  if (process.platform === "darwin") return { command: "afplay", args: [sound.path] };
  return { command: "aplay", args: ["-q", sound.path] };
}
function playSound(sound, logError) {
  if (sound.kind === "file" && !existsSync(sound.path)) {
    logError(`notify sound file missing: ${sound.path}`);
    return;
  }
  const { command, args } = playerCommand(sound);
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => logError(`notify player spawn failed: ${error.message}`));
  child.on("exit", (code) => {
    if (code !== 0) logError(`notify player exited ${code}: ${stderr.trim()}`);
  });
  child.unref();
}
function pushNtfy(baseUrl, topic, title, message, logError) {
  void fetch(`${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: { Title: title, Priority: "3" },
    body: message
  }).catch((error) => logError(`ntfy push failed: ${error.message}`));
}
function apply(ctx, config) {
  const home = resolveDshHome();
  const homeSound = join(home, "sounds", "finish.wav");
  const packagedSound = join(dirname(fileURLToPath(import.meta.url)), "..", "sounds", "finish.wav");
  if (!existsSync(homeSound) && existsSync(packagedSound)) {
    try {
      mkdirSync(dirname(homeSound), { recursive: true });
      copyFileSync(packagedSound, homeSound);
    } catch (error) {
      ctx.logger("dsh-notify-desktop").warn(`notify bundled sound copy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const successSound = config.successSoundPath ? { kind: "file", path: config.successSoundPath } : { kind: "file", path: homeSound };
  const errorSound = config.errorSoundPath ? { kind: "file", path: config.errorSoundPath } : { kind: "exclamation" };
  const logError = (message) => {
    ctx.logger("dsh-notify-desktop").warn(message);
  };
  let lastNotifiedAt = 0;
  const notify = (kind, title, message) => {
    const now = Date.now();
    if (now - lastNotifiedAt < config.cooldownMs) return;
    lastNotifiedAt = now;
    playSound(kind === "success" ? successSound : errorSound, logError);
    if (config.ntfyTopic !== "") pushNtfy(config.ntfyServer, config.ntfyTopic, title, message, logError);
  };
  const turnStarts = /* @__PURE__ */ new Map();
  ctx.on("session/event", (_session, event) => {
    const sessionId = String(_session.id);
    if (event.type === "turn/start") {
      turnStarts.set(sessionId, Date.now());
    } else if (event.type === "turn/end") {
      const startedAt = turnStarts.get(sessionId);
      turnStarts.delete(sessionId);
      if (startedAt !== void 0 && Date.now() - startedAt >= config.minTurnDurationMs) {
        const seconds = Math.round((Date.now() - startedAt) / 1e3);
        notify("success", "DSH \u56DE\u5408\u7ED3\u675F", `\u56DE\u5408\u8017\u65F6 ${seconds}s`);
      }
    } else if (config.notifyOnToolError && event.type === "tool/result" && event.data.error !== void 0) {
      notify("error", "DSH \u5DE5\u5177\u5931\u8D25", `${event.data.error.name} (${event.data.error.code})`);
    }
  });
  ctx.inject(["jobs"], (jobsCtx) => {
    const onJobDone = (snapshot) => {
      if (!config.notifyOnJobDone) return;
      const ok = snapshot.status === "completed";
      const detail = snapshot.detail !== void 0 ? ` (${snapshot.detail})` : "";
      notify(
        ok ? "success" : "error",
        "DSH \u540E\u53F0\u4EFB\u52A1\u7ED3\u675F",
        `${snapshot.label} [${snapshot.id}] \u2014 ${snapshot.status}${detail}`
      );
    };
    jobsCtx.jobs.onJobDone(onJobDone);
  });
}
export {
  Config,
  apply,
  name,
  playSound,
  pushNtfy
};
