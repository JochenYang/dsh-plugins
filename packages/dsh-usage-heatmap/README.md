# dsh-usage-heatmap

DeepSeek Harness 用量热力图插件：每日/按模型 的 token 用量、缓存命中率与估算成本。
数据全部来自本机会话事件日志（`assistant/message.usage`），**不改 dsh 源码、无外部依赖**。

## 功能

- **设置页原生嵌入（非 iframe）**：设置 → 左侧导航"📊 用量统计" → 右侧直接渲染原生 React 界面，
  全部使用 DSH 共享的 `--dsw-alias-*` 设计 token，随浅色/深色主题自动适配（参照 dsh-at-file 的嵌入方式）
- **热力日历**：最近 26 周每日用量（GitHub 贡献图风格），可切换"总 tokens / 请求数"为着色依据；
  星期标签完整（日～六）且与数据行按真实星期对齐；月份标签用紧凑格式（`2月`、`3月`…），
  任何字体下都不会与相邻标签碰撞；面板标题带日期范围（如 `2026-02-15 ~ 2026-08-15`）
- **每日趋势**：7/30/90/365 天堆叠柱状图（未命中输入 / 缓存读 / 缓存写 / 输出）+ 缓存命中率折线，
  时间轴最旧→最新；**悬停任意一天显示当日明细**（请求数、命中率、各分段 tokens、估算成本）并高亮该列
- **按模型明细**：每模型 请求数 / 输入 / 输出 / 缓存读 / 缓存写 / 命中率 / 成本 / 占比
- **估算成本**：按插件配置的定价表计算；未匹配模型不计成本
- **独立页面**：`/_dsh/usage-heatmap/`（`prefers-color-scheme` 跟随系统主题；设置页内也有"独立标签页打开"链接）

## 数据获取

- **实时**：监听 `session/event` 的 `assistant/message` 事件（适配器上报 `TokenUsage` 时）
- **回填**：启动时（及周期重扫）用 `sessionPersistence.inspect()` 只读折叠所有持久化会话日志
- 两者共用按会话水位线（`watermarks.json`）去重，`(sessionId, seq)` 幂等
- 存储：`~/.dsh/storages/dsh-usage-heatmap/usage.jsonl`（append-only）+ `watermarks.json`

> 已知限制：失败的请求（无 assistant message 组装）与未上报 usage 的旧日志不计入；
> 缓存命中率 = 缓存读 /（未命中输入 + 缓存读 + 缓存写）。

## 安装

```sh
# 安装进 web profile
 dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-usage-heatmap
dsh --profile web --dump-config | Select-String -Pattern usage-heatmap

# 重启 DSH（bundle 增删需重启宿主；客户端 bundle 进 boot graph 也依赖重启）
```

> 改代码后同步：`git push` 后在 profile 目录执行 `pnpm update dsh-usage-heatmap`
> （github 安装按 commit 检测，无需升版本号）。
>
> 开发期迭代：客户端 bundle（`lib/client.js`）由 web server 每次从磁盘读取（`cache-control: no-cache`），
> 只改客户端代码时把新 bundle 拷进 `profiles/web/node_modules/dsh-usage-heatmap/lib/` 并刷新页面即可，
> 无需重启；服务端代码（聚合、路由、独立页 HTML）仍需要重启 DSH。

安装后打开：设置 → 左侧导航"📊 用量统计"，或直接访问 `http://127.0.0.1:<port>/_dsh/usage-heatmap/`。

## 配置（cordis.patch.yml / settings.yaml）

| 键 | 默认 | 说明 |
|---|---|---|
| `storePath` | `""` | 存储目录；空 = `<dshHome>/storages/dsh-usage-heatmap` |
| `backfillOnStart` | `true` | 启动时回填全部历史会话 |
| `rescanMinutes` | `5` | 周期重扫分钟数，`0` 关闭 |
| `pricing` | DeepSeek-V4 新定价 | `[{provider, model, input, output, cacheRead, cacheWrite}]`，$/M token |

### 定价表说明

默认内置 **DeepSeek-V4 API 新定价**（北京时间 2026-08-17 00:00 生效，¥/1M tokens）：

| 模型 | 时段 | 缓存命中输入 | 未命中输入 | 输出 |
|---|---|---|---|---|
| V4-Flash | 空闲 | ¥0.05 | ¥1.5 | ¥4.5 |
| V4-Flash | 高峰 | ¥0.10 | ¥3.0 | ¥9.0 |
| V4-Pro | 空闲 | ¥0.15 | ¥4.5 | ¥13.5 |
| V4-Pro | 高峰 | ¥0.30 | ¥9.0 | ¥27.0 |

高峰时段 = 北京时间 9:00–12:00、14:00–18:00；高峰价格恒为空闲的 2 倍。

- 插件按"每路由单一价格"估算，无法表达高峰/空闲双档：配置采用**空闲档价格**（¥→$ 按 7.2 折算），
  即**估算下限**；实际成本介于配置结果与 2 倍之间（本机近 30 天实测高峰占比约 21.6%，≈1.22 倍）。
- `provider/model` 精确匹配；默认同时覆盖本机实际使用的 `opencode-go` 与 `deepseek-official`
  两个 provider 的 v4-flash/v4-pro，并保留 deepseek-chat/reasoner 旧档。
- 成本按 `(input + cacheWrite) * input 价 + cacheRead * cacheRead 价 + output * output 价` 估算。

## 开发

```powershell
pnpm install
pnpm typecheck && pnpm typecheck:client
pnpm build && pnpm build:client
pnpm pack
```

改代码后重打包，**remove + add**（或升版本号）后重装，重启 DSH。

## 验证

- `pnpm typecheck && pnpm typecheck:client` — 两侧类型检查
- `node test/smoke.mjs`（esbuild 打包 test/smoke.entry.ts 后运行）— 宿主数据链路（fold/聚合/定价/路由）
- `node test/render-smoke.mjs`（esbuild 打包 test/render-smoke.entry.tsx 后运行）— 设置页组件渲染冒烟
- `node test/real-data-check.mjs <某会话的 session.jsonl.zstd>`（先用 esbuild 打包：
  `npx esbuild test/real-data-check.mjs --bundle --platform=node --format=esm --outfile=test/real-data-check.bundle.mjs`）
  对真实会话日志跑折叠，验证数据获取链路
- 生成的 `test/smoke.mjs` / `test/render-smoke.mjs` / `test/real-data-check.bundle.mjs` 已 gitignore
