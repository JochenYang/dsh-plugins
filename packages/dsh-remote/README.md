# dsh-remote — 手机远程连接（桌面 host 端）

> 让手机浏览器像桌面端一样操作 DeepSeek Harness：
> 通过自研 `relay-server` 中转（HTTP 反向代理 + WebSocket 帧桥接），
> dsh 自带的 web 适配在手机上直接生效，无需改 dsh 内核与前端。

## 安装

1. 部署自研中继：见 [relay-server](../relay-server/README.md)（VPS + TLS）。
2. 安装插件并重启 DSH：

```sh
dsh plugin --profile web add <此包打包出的 dsh-remote-<ver>.tgz>
```

3. 打开 **设置 → 手机连接**：填入中继地址（`https://relay.example.com`）与
   `HOST_TOKEN`（与 relay 部署时一致），点击"连接"。
4. 页面显示的 6 位**配对码**：用手机浏览器打开 `https://relay.example.com/pair`
   输入即可。配对成功后手机自动跳转到桌面工作区，与桌面端同源操作。

## 快速体验（本地联调）

```sh
# 终端 1：起中继（默认 127.0.0.1:8787，HOST_TOKEN=devtoken）
node packages/relay-server/dist/cli.js --host-token devtoken --port 8787

# 终端 2：正常启动 DSH（含本插件），设置内连接 http://127.0.0.1:8787

# 终端 3：curl 验证隧道
curl -x '' -H "x-dsh-relay-token: <手机 token>" "http://127.0.0.1:8787/d/<deviceId>/api/host.describe" -i
```

协议契约见 [docs/PROTOCOL.md](../../docs/PROTOCOL.md)。

## 详解

- 上行：手机浏览器对 `/d/<deviceId>/*` 的 HTTP 请求 → relay → host（本插件）
  → 本地 dsh web server（`127.0.0.1:<dshWebPort>`），响应流式回传。
- 下行：dsh 前端的两条事件流（`/events/mux`、`/events/host`）为 WebSocket，
  由 relay 透传 `ws-open/ws-frame/ws-close` 帧，本插件在本地建立等价 WS 双向搬运。
- 安全：配对码 + 挑战-响应（device-level），`HOST_TOKEN` 自托管信任边界。