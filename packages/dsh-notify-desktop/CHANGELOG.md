# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
