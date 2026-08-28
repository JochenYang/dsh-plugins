# dsh-remote-relay — 自研中继服务器

dsh-remote 手机连接隧道的服务端：负责**设备配对、挑战-响应认证、HTTP 反向代理
与 WebSocket 帧桥接**，把手机浏览器与桌面 host 连接起来。

独立于 DSH 部署（推荐 VPS + TLS 反代）。协议契约见
[docs/PROTOCOL.md](../../docs/PROTOCOL.md)。

## 快速开始

```sh
pnpm install
pnpm start -- --host-token <你的令牌> --admin-token <管理口令> --port 8787 \
  --data-dir ~/.dsh-remote-relay
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--host-token` | 必填 | host 注册的唯一信任边界；dsh-remote 插件需填同样值（至少 16 字符） |
| `--admin-token` | 可选 | 管理台 /admin 登录口令（至少 8 字符）；缺省时管理台整体禁用 |
| `--port` | `8787` | 监听端口 |
| `--host` | `0.0.0.0` | 监听地址（TLS 反代后建议保持默认） |
| `--data-dir` | `~/.dsh-remote-relay` | JSONL 数据目录（配对码哈希 / token 哈希 / 设备表） |
| `--quiet` | 关 | 抑制请求日志（仅保留 `relay` 前缀行） |

## TLS

relay 本身不终结 TLS，用反代（推荐 caddy 自动证书）：

```caddy
relay.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

## 路由总览

| 路由 | 作用 |
|---|---|
| `/` | 首页（二维码 + 状态） |
| `/pair` | 手机配对入口（POST `{code}` 换挑战） |
| `/manifest.webmanifest` | 静态 PWA manifest（无鉴权：浏览器拉取 manifest 不带 cookie，无法走代理） |
| `/d/<deviceId>/*` | 主代理入口：静态资源与 API 一律转发，WS upgrade 透传 |
| `/ws?role=host|phone` | host 注册 / 手机握手的 WebSocket 控制面 |

## 安全

- 挑战-响应防重放（challenge 60s 一次性）；配对码 10 分钟 TTL + 限速。
- 落盘仅存 `sha256(code)` / `sha256(token)`；日志脱敏。
- `HOST_TOKEN` 即信任边界：谁持有它谁可注册/接管 host 身份（自托管前提）。


## 服务器部署（VPS，推荐）

以 Ubuntu/Debian 为例。目录结构：Node 22 + 项目（pnpm 构建产物）+ systemd + caddy 反代。

> **CentOS / Rocky / Alma 一键部署**：构建产物自带 `deploy/install.sh`（npm tarball 内），
> 上传解包后执行 `sudo bash install.sh <你的域名>` 即可——自动装 Node 22、生产依赖、
> systemd 服务、caddy TLS 反代与防火墙放行，并生成/保存 HOST_TOKEN 与 ADMIN_TOKEN 到
> `/etc/dsh-remote-relay.env`。常规手动步骤见下。

### 1. 环境与代码

```sh
sudo apt update && sudo apt install -y nodejs npm curl
node -v   # 需要 >= 22
sudo npm install -g pnpm

git clone <你的 dsh-configure 仓库地址> ~/dsh-configure
cd ~/dsh-configure/packages/relay-server
pnpm install
pnpm build
```

不打算用 git 的话，直接把本机构建好的 `dist/` 目录、`package.json`（dependencies 保持 `ws`）与 `~/.dsh-remote-relay` 数据目录同步上去，并 `pnpm install` 补齐产物即可。

### 2. 生成令牌

```sh
HOST_TOKEN=$(openssl rand -hex 32)    # 桌面端 host 注册用
ADMIN_TOKEN=$(openssl rand -hex 16)   # 管理台登录用
echo "HOST_TOKEN=$HOST_TOKEN"
echo "ADMIN_TOKEN=$ADMIN_TOKEN"
```

### 3. systemd 服务

```ini
# /etc/systemd/system/dsh-remote-relay.service
[Unit]
Description=dsh-remote relay server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/root/dsh-configure/packages/relay-server
ExecStart=/usr/bin/env pnpm start -- --host-token <HOST_TOKEN> --admin-token <ADMIN_TOKEN> --host 127.0.0.1 --port 8787 --data-dir /var/lib/dsh-remote-relay
Restart=always
RestartSec=3
# 日志交给 journald；若想落文件可加：StandardOutput=append:/var/log/dsh-remote-relay.log
NoNewPrivileges=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

注意：systemd 里监听 `127.0.0.1`（仅本机），公网流量全部由 caddy 终结 TLS 后转发——不要裸跑 0.0.0.0。

```sh
sudo install -o www-data -d /var/lib/dsh-remote-relay
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-remote-relay
sudo systemctl status dsh-remote-relay
journalctl -u dsh-remote-relay -f   # 看日志
```

### 4. TLS 反代（caddy，自动证书）

```caddyfile
# /etc/caddy/Caddyfile
relay.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8787
}
```

```sh
sudo systemctl enable --now caddy
```

之后手机会话与管理台都走 `https://relay.example.com`（安全上下文，顺便解决手机端 crypto.randomUUID 等 Secure Context API 限制，不再依赖中继注入的 polyfill）。

### 5. 防火墙

```sh
sudo ufw allow 80/tcp     # caddy ACME 校验
sudo ufw allow 443/tcp    # HTTPS
```

### 6. 配置桌面端

dsh-remote 插件「设置 → 手机连接」中：
- **中继地址**：`https://relay.example.com`
- **中继令牌**：上面生成的 `HOST_TOKEN`

保存后插件应显示"在线"，并可获取配对码 / 二维码扫描。

## 管理台（/admin）

独立于手机配对流程，用于查看与管控设备。

- **启用**：启动参数加 `--admin-token <口令>`；缺省则 /admin 返回 404。
- **登录**：浏览器访问 `https://relay.example.com/admin`，输入 `ADMIN_TOKEN`。
- **会话**：登录态 24h，HttpOnly + SameSite=Strict；有独立尝试限速（5 次/分钟）。

### 能力

| 能力 | 说明 |
|---|---|
| 设备总览 | 每台设备：hostName、完整 deviceId、在线状态、最后心跳、注册时间 |
| 配对码 | 当前有效 6 位配对码及剩余有效期（在线主机才有） |
| 手机会话数 | 该设备当前活跃的手机浏览器会话数 |
| 令牌指纹 | 每台设备历史上签发的令牌 sha256 前缀 + 签发/吊销时间 |
| 断开手机 | 只断当前手机会话，令牌保留，配对码不变 |
| 吊销设备 | 作废该设备全部令牌 + 断开所有手机 + 清配对码，并通知在线 host 清掉其内存配对码 |

### 吊销 / 断开后如何重新连接

- **断开手机**（轻）：仅清除手机 cookie 会话。手机刷新页面会回到配对页，用**仍有效**的配对码重新配对即可，桌面端无需操作。
- **吊销设备**（重）：全部令牌作废、配对码作废。手机刷新后进入配对页，但旧配对码已失效——需要在桌面端「设置 → 手机连接」**点一次刷新**生成新配对码，手机重新扫码或输入新码完成配对，随后自动回到应用界面。

两种操作都不会影响桌面 host 连接本身（host 靠 HOST_TOKEN 注册，与手机令牌无关）。
