# dsh-plugins

JochenYang 的 DeepSeek Harness 插件集（monorepo）。

## 插件列表

| 插件 | 版本 | 说明 |
|---|---|---|
| [`dsh-git-conventions`](packages/dsh-git-conventions) | 0.1.0 | 模型侧的 Git 提交规范校验（commit message 格式 / 长度 / 正文 / 分支名） |
| [`dsh-notify-desktop`](packages/dsh-notify-desktop) | 0.2.0 | 桌面通知 + 声音提醒（长回合 / 后台任务结束 / 工具失败），附默认铃声 |
| [`dsh-usage-heatmap`](packages/dsh-usage-heatmap) | 0.1.0 | 设置页用量热力图：每日 / 按模型的 token 用量、缓存命中率与成本 |
| [`dsh-vision-bridge`](packages/dsh-vision-bridge) | 0.3.0 | 视觉桥接：贴图转路径标记，纯文本模型也能"看图" |

## 安装

前提：已安装 DeepSeek Harness（`dsh`）；插件按 **profile** 安装，默认 `web`。

### 方式一：dsh-market（推荐）

1. 安装插件市场：`dsh plugin --profile web add dshmarket`
2. 重启 DSH 后，打开 **设置 → 插件市场**，搜索插件名一键安装

### 方式二：命令行

每个插件独立安装（monorepo 子包）：

```sh
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-git-conventions
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-notify-desktop
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-usage-heatmap
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-vision-bridge
```

安装后**重启 DSH**（或 DSH Desktop）生效。各插件的详细配置见各自 README。

## 更新插件

```sh
# 在 profile 目录执行（默认 ~/.dsh/profiles/web）
pnpm update dsh-notify-desktop
```

或直接在 dsh-market 的已装插件里点更新（按 GitHub HEAD 检测新版本）。改完代码并推送后，`pnpm update` 即可拉到最新提交。

## 本地开发

```sh
git clone https://github.com/JochenYang/dsh-plugins
cd packages/dsh-notify-desktop
pnpm install
pnpm build        # esbuild 重新生成 lib/
pnpm typecheck    # 类型检查
```

改完 `git push` 后，在 profile 目录执行 `pnpm update <插件名>` 即可同步。

## License

各包以各自 `package.json` 的 license 字段为准（当前为 MIT）。
