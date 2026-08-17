# dsh-plugins

JochenYang 的 DeepSeek Harness 插件集（monorepo）。

## 插件列表

| 插件 | 版本 | 说明 |
|---|---|---|
| [`dsh-git-conventions`](packages/dsh-git-conventions) | 0.1.0 | Git 提交规范 |
| [`dsh-notify-desktop`](packages/dsh-notify-desktop) | 0.2.0 | 桌面通知 + 声音提醒 |
| [`dsh-usage-heatmap`](packages/dsh-usage-heatmap) | 0.1.0 | 用量热力图 |
| [`dsh-vision-bridge`](packages/dsh-vision-bridge) | 0.3.0 | 视觉桥接（贴图转路径标记） |

## 安装

```sh
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-vision-bridge
```

或直接在 dsh-market 设置页搜索安装。
