# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.3.3] - 2026-09-05

### Fixed

- `pasteMode: auto` 现在真正按能力分流：客户端缓存当前会话/模型的原生图片能力（会话切换与模型切换时自动刷新），支持图片输入的模型粘贴时放行 DSH 原生流程，纯文本模型仍走缓存+路径标记。此前 0.3.0 起 `auto` 与 `path` 行为相同，多模态模型也被拦截走 `vision_glance`
- 能力刷新带代际防乱序：并发触发的旧响应不覆盖新状态；host 端模型能力不可判定时返回 `null`（未知 ≠ 不支持），客户端不缓存未知态、下次失效自动重试
- 非编辑阶段的图片粘贴从静默丢弃改为提示"正在生成/提交中，已忽略"
- config 端点（`GET /_dsh/vision-bridge/config`）新增 `sessionId`/`provider`/`model` 查询参数并返回 `canAcceptImages`；客户端实时选中的模型优先于会话已记录模型
- skill 与工具文案条件化：多模态模型对非粘贴来源的图片文件（E2E/浏览器截图等）优先原生 `read_image`；粘贴标记仍一律 `vision_glance`（保护会话可切换性）

### Removed

- 清理 0.1/0.2 自动分流设计的残留死代码：POST 上传响应不再返回无人消费的 `canAcceptImages` 字段，`PasteImageRuntime.canAcceptImages` 成员与客户端无用的 provider/model POST 提示参数移除（能力查询统一走 config 端点）

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
