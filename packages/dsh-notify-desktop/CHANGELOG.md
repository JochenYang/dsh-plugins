# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Fixed

- 默认铃声随包分发：`sounds/finish.wav` 打进安装包，首次加载时自动复制到 `<dshHome>/sounds/finish.wav`——新用户开箱即有成功音，不再因缺少本地文件而静默无声

## [0.2.0] - 2026-08-16

首个可安装版本。

### Added

- 回合超阈值（`minTurnDurationMs`）完成、后台任务结束、工具调用失败时播放声音并可推送到 ntfy
- 成功音（默认 `<dshHome>/sounds/finish.wav`）与错误音（默认 Windows 系统提示音）分离，均可在 `cordis.patch.yml` 覆盖路径
- 全局冷却（`cooldownMs`），播放/推送失败仅记日志不抛错

[0.2.0]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-notify-desktop
