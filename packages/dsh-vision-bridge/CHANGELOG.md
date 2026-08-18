# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.3.1] - 2026-08-18

### Changed

- `vision_glance` 的 `max_tokens` 从 2048 提升到 8192，为推理型视觉模型预留 token 预算
- 默认描述提示词（未传 `question` 时）升级为结构化四段式输出：场景概述、关键细节、文字转录（OCR）、注意事项，中英文按 `language` 配置

## [0.3.0] - 2026-08-16

### Changed

- 纯路径粘贴模式（pure-path）：粘贴图片缓存到会话工作区/`~/.dsh/cache`，消息中只保留文本路径标记，模型经 `vision_glance` 调用外部视觉 API——图片永不进入主模型上下文，纯文本模型可自由切换

> 早期 0.1.x / 0.2.x 为本地开发版本，变更未记录。

[0.3.0]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-vision-bridge
[0.3.1]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-vision-bridge
