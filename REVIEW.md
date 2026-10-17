# REVIEW.md — 本仓库的评审判据

与 `AGENTS.md` 一起使用：AGENTS.md 讲怎么干活，这里讲「什么算失败」。
结论按严重度排序，每条给 `路径:行号`，并标注是跑出来的还是读出来的；没有问题就直说「没有阻塞问题」。

## 风险分级（按改动位置，不按作者）

| 改动位置 | 级别 | 要求 |
|---|---|---|
| `docs/`、README、注释 | 低 | `pnpm typecheck` 通过即可 |
| `packages/dsh-notify-desktop`、`dsh-usage-heatmap`、`dsh-git-conventions` 的行为 | 中 | 类型门（含 `typecheck:client`）+ 复现脚本 + 新上下文评审 |
| `packages/relay-server`、安装与部署脚本、profile 操作 | 高 | 两次独立评审（其中一次只读 diff）+ 写明回滚步骤 |

## 各包「失败长什么样」

- `dsh-notify-desktop`：对非事件报警（噪声）比漏报更常见。任何触发条件都要能回答「谁在等这个结果」；已经踩过三次：teardown 结算、前台命令的 `awaited` 结算、0.2.0 恢复补写的合成结果。
- `dsh-usage-heatmap`：读错会话日志来源、日期分桶或时区错位；host 与 client 的统计口径不一致。
- `dsh-git-conventions`：误拒合法提交信息；规则与本仓库 AGENTS.md 里写的格式漂移。
- `relay-server`：认证与权限边界、凭据泄漏、回滚不可行。

## 评审要求

- nit 上限：一次评审最多 3 条纯风格意见；其余只报会改变行为或判断的问题。
- 跳过：`*.tgz`、`lib/`、生成的 `tsconfig.client-paths.json`、`scratch/`、纯格式化差异。
- 区分本次引入与 `Pre-existing`；纯风格与诊断类默认 `nit`，不计入阻塞。
- 同类问题一次修完全部实例，不逐条修。
- 三轮不收敛就停下重新看方案；首轮之后只看新增 diff。
- 已解决的 finding 不重复报；反复出现的意见改到源头（本文件、AGENTS.md、lint 规则或脚本）。

## 回归检查

历史事故与对应检查见 [`docs/incidents.md`](docs/incidents.md)。提交前至少跑：

```sh
node scripts/preflight.mjs
```
