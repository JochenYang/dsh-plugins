# Changelog

本插件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-08-16

首个可安装版本：设置页"用量统计"面板 + 独立标签页。

### Added

- 设置页原生 React 嵌入（非 iframe）：热力日历、按模型用量表、每日趋势图，30s 自动刷新与 7/30/90/365 天区间切换
- 数据链路：实时监听 `session/event` + 启动/周期回填 `sessionPersistence.inspect()`，按 `(sessionId, seq)` 水位线幂等折叠，append-only JSONL 存储
- 独立页面 `/_dsh/usage-heatmap/`，`prefers-color-scheme` 跟随系统主题
- 定价表（`pricing` 配置）与成本估算：默认 DeepSeek-V4 新定价（2026-08-17 生效），覆盖 `opencode-go` / `deepseek-official` 的 v4-flash/v4-pro
- 冒烟测试：服务端数据链路（fold/聚合/定价/路由）与设置页组件渲染

### Changed

- 每日趋势 X 轴按最旧→最新排列（修正原先时间倒序）
- 热力日历星期标签与数据行按真实星期对齐（修正窗口起始非周日时的错位）

### Fixed

- 热力日历月份标签互相重叠（"2026-022026-03"）：改为紧凑格式 `2月`、`3月`…，年份移入面板标题日期范围
- 独立页日历因 `grid-auto-flow: column` 导致标签错位、`六` 与月份标签重叠：改为显式网格定位
- 每日趋势缺少悬停明细：悬停显示当日请求数/命中率/各分段 tokens/成本，并高亮对应列

[0.1.0]: https://github.com/JochenYang/dsh-plugins/tree/main/packages/dsh-usage-heatmap
