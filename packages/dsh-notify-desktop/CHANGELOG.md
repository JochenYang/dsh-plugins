# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.5] - 2026-10-19

### Fixed

- 「任务完成了却没声音」的三条成因：冷却原本是**全局单一时间戳**，后台任务、工具错误、子智能体会话与主回合共用同一个 5 秒窗口，先响的那条把后到的那条吃掉。现在冷却按来源分槽（`turn` / `turn-child` / `tool` / `job`），一个来源的声音不再压住另一个来源
- 热重载后回合结束静默：`turnStarts` 是内存 Map，bundle 的 `hmr` 行会在配置变更时重建插件实例，重载前已在跑的回合到 `turn/end` 时查不到开始时间而直接跳过。现在回落到会话日志里查 `turn/start`（比对 turn 号，遇到别的 `turn/end` 就停止回溯），内存 Map 只作快路径
- 失败的回合播成功音：`turn/end` 此前不论 `reason.kind` 都走成功音。现在 `error` 走错误音与「DSH 回合失败」标题；用户主动中断（`aborted`）仍保留成功音——人就在屏幕前，不该被告警

## [0.2.4] - 2026-09-28

### Fixed

- 步骤失败不再误报工具错误：dsh 0.2.0 起，失败或中断的步骤会通过 `ToolCallRecovery` 给没有记录到结果的工具调用补写合成的 `tool/result`（错误码 `TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN`）。这类结果描述的是 harness 自身的收尾，模型下一步就能看到，不该再响一次错误音

## [0.2.3] - 2026-09-23

### Fixed

- 前台命令不再误报：shell 工具的每次调用都会把进程注册成 job，前台命令由该次调用等待（`awaited: true`），结果已经回到模型手里。此前对所有 `settled` 一律提醒，导致模型每执行一条命令都响一次；现在只提醒无人等待的后台任务

## [0.2.2] - 2026-09-23

### Fixed

- 任务销毁（`cause: 'teardown'`）不再报成失败：owner 或 jobs 服务被销毁时，存活任务会被强制结算，那是清理而非结果。此前每次会话销户、preset 卸载、profile 重载都会触发一串错误音与推送

## [0.2.1] - 2026-09-23

### Fixed

- 后台任务结束通知在 dsh 0.1.7 上完全失效：`ctx.jobs.onJobDone` 已随 jobs seam 重构移除，改订阅 `ctx.jobs.events`（`{ owners: 'all' }` 过滤）并处理 `settled` 事件；`JobDoneListener` 类型同步换成 `JobEvent`
- 默认铃声随包分发：`sounds/finish.wav` 打进安装包，首次加载时自动复制到 `<dshHome>/sounds/finish.wav`——新用户开箱即有成功音，不再因缺少本地文件而静默无声
- `pack.mjs` 改为按 manifest 的 `files` 列表打包：此前只硬编码拷贝 `lib`/`cordis.patch.yml`/`README.md`，`sounds/` 虽在 `files` 里却从未进包
- tsconfig 的 harness 类型路径修正为三级相对（`../../../`）：此前少一级，`pnpm typecheck` 退化为解析不到任何声明，等于没有类型门

## [0.2.0] - 2026-08-16

首个可安装版本。

### Added

- 回合超阈值（`minTurnDurationMs`）完成、后台任务结束、工具调用失败时播放声音并可推送到 ntfy
- 成功音（默认 `<dshHome>/sounds/finish.wav`）与错误音（默认 Windows 系统提示音）分离，均可在 `cordis.patch.yml` 覆盖路径
- 全局冷却（`cooldownMs`），播放/推送失败仅记日志不抛错

[0.2.1]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-notify-desktop
[0.2.0]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-notify-desktop
