# 历史事故与回归检查

每条事故记录：症状、根因、本该拦住它的检查、现状。
新事故按同样格式追加；能被自动化的检查进 [`scripts/preflight.mjs`](../scripts/preflight.mjs)。

| # | 症状 | 根因 | 本该拦住的检查 | 现状 |
|---|---|---|---|---|
| 1 | market 永远提示「有新版本」/`STALE(unknown)` | `github:` 子路径 spec 没有可比对的 semver | 安装 spec 只允许 `file:` 本地 tgz 或已发布 Release 直链 | 规则（AGENTS.md） |
| 2 | `ENOENT ...tgz`，market 安装/更新静默失败 | 升版本或搬目录后，profile 的 `file:` spec 仍指旧路径 | 打包后核对 spec 路径、文件名版本与源码版本 | `scripts/preflight.mjs` |
| 3 | 会话销毁时一串错误音 | teardown 结算被当成任务失败 | 结算过滤 `cause === 'teardown'` | 已修 0.2.2 |
| 4 | 模型每执行一条命令响一次 | 前台命令的 `awaited` 结算被当成后台任务完成 | 跳过 `awaited` 结算 | 已修 0.2.3 |
| 5 | 步骤失败时多响一次错误音 | dsh 0.2.0 起 `ToolCallRecovery` 补写合成的 `tool/result` | 跳过 `TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN` | 已修 0.2.4 |
| 6 | dsh 升级后插件静默失效 | 类型门对着 harness 仓库的构建产物，滞后一个版本 | 类型门对已安装运行时的声明 | `scripts/preflight.mjs` |
| 7 | profile 装包报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | lockfile 里有 24h 冷却期内的版本 | 装包命令带 `--config.minimumReleaseAge=0` 单次覆盖，或把版本加进白名单 | 规则（AGENTS.md） |

## 待补

- 事故 3–5 都是「通知对非事件报警」，目前靠代码里的条件与注释防回归；若要自动化，需要在 `dsh-notify-desktop` 里加一个事件级测试，用伪造的 `session/event` / `JobEvent` 断言哪些不提醒。
- `relay-server` 还没有对应的历史事故条目；服务器侧的权限与凭据问题在事故出现前就该有检查（见 REVIEW.md 的高风险要求）。
