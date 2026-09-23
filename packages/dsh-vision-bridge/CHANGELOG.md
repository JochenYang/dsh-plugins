# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.3.5] - 2026-09-23

### Fixed

- 上传期间切换会话不再写错草稿：composer 动作面在粘贴时按会话捕获一次并复用，此前每次插入都重读 `adapter.current`（跟随主视图实时变化），异步上传跨越会话切换时标记会落进另一个会话
- 无法解析目标时不再静默吞掉粘贴：缺少当前会话、scope 未保留、动作面缺失三条路径改为保留 DSH 原生处理并记录原因；此前事件被 `preventDefault` 吞掉后无任何反馈
- 失败提示文案改为真实原因（composer 忙/锁定），不再误报"草稿在上传期间变化"

## [0.3.4] - 2026-09-23

### Fixed

- 浏览器端在 dsh 0.1.7 上完全失效，三处 API 变更逐一适配：
  - 输入面已从 `<textarea>` 改为 Lexical 驱动的 contenteditable div（`data-composer-input`，位于 `[data-composer-card]` 内），粘贴守卫随之从 `HTMLTextAreaElement` 放开到 `HTMLElement`——此前守卫恒为 false，粘贴从不被拦截
  - `SessionListState.current` 已移除，当前会话改为从 retention 投影推导（`byId` 中 `retainedBy.mainView > 0` 的行）
  - 草稿写入改走 `ctx.uiSession` 暴露的 `InputActions`（`captureInsertion()` + `insertText()`）：带 draftRev 版本守卫、单次撤销、不破坏引用 chip；旧的 `selectionStart`/`setDraft` 路径随 textarea 一同消失
- `dsh.client.inject` 补上 `@deepseek-ai/dsh-client-ui-session`：新增的 `ctx.uiSession` 依赖需要声明加载边

## [0.3.3] - 2026-09-05

### Fixed

- `pasteMode: auto` 现在真正按能力分流：客户端缓存当前会话/模型的原生图片能力（会话切换与模型切换时自动刷新），支持图片输入的模型粘贴时放行 DSH 原生流程，纯文本模型仍走缓存+路径标记。此前 0.3.0 起 `auto` 与 `path` 行为相同，多模态模型也被拦截走 `vision_glance`
- 能力刷新带代际防乱序：并发触发的旧响应不覆盖新状态；host 端模型能力不可判定时返回 `null`（未知 ≠ 不支持），客户端不缓存未知态、下次失效自动重试
- 非编辑阶段的图片粘贴从静默丢弃改为提示"正在生成/提交中，已忽略"
- config 端点（`GET /_dsh/vision-bridge/config`）新增 `sessionId`/`provider`/`model` 查询参数并返回 `canAcceptImages`；客户端实时选中的模型优先于会话已记录模型
- skill 与工具文案条件化：多模态模型对非粘贴来源的图片文件（E2E/浏览器截图等）优先原生 `read_image`；粘贴标记仍一律 `vision_glance`（保护会话可切换性）

### Removed

- 清理 0.1/0.2 自动分流设计的残留死代码：POST 上传响应不再返回无人消费的 `canAcceptImages` 字段，`PasteImageRuntime.canAcceptImages` 成员与客户端无用的 provider/model POST 提示参数移除（能力查询统一走 config 端点）

### Changed

- client 类型门修复：新增 `scripts/gen-client-paths.mjs` 扫描 harness 生成全量类型映射 `tsconfig.client-paths.json`（1715 条），`tsconfig.client.check.json` 以 Bundler 解析 + noEmit 消费之；`typecheck:client` 从被 skipLibCheck 掩蔽的空门变为真实门（变异测试实证：不存在的 `store.subscribeX` 现在报 TS2551）。构建链不变，`lib/client.js` 字节级一致

## [0.3.1] - 2026-08-18

### Changed

- `vision_glance` 的 `max_tokens` 从 2048 提升到 8192，为推理型视觉模型预留 token 预算
- 默认描述提示词（未传 `question` 时）升级为结构化四段式输出：场景概述、关键细节、文字转录（OCR）、注意事项，中英文按 `language` 配置

## [0.3.0] - 2026-08-16

### Changed

- 纯路径粘贴模式（pure-path）：粘贴图片缓存到会话工作区/`~/.dsh/cache`，消息中只保留文本路径标记，模型经 `vision_glance` 调用外部视觉 API——图片永不进入主模型上下文，纯文本模型可自由切换

> 早期 0.1.x / 0.2.x 为本地开发版本，变更未记录。

[0.3.4]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-vision-bridge
[0.3.0]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-vision-bridge
[0.3.1]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-vision-bridge
