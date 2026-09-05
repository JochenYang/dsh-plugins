# dsh-vision-bridge

给纯文本 DSH Agent 的最小识图插件：粘贴图片 → 存入会话工作区 → 消息里只有文本路径标记 → 模型调用 `vision_glance` 把图片发给外部视觉 API 并取回文字答案。

**设计要点（v0.3.3 起按能力分流）**：`pasteMode: auto`（默认）下，粘贴按当前模型能力路由——支持原生图片输入的模型放行 DSH 原生粘贴直接看图；纯文本模型的粘贴图片缓存到本地、消息只携带路径标记，图片不进主模型上下文，DSH 的原生图像门禁（`model.inputModalities` / `attachment-error`）从源头不会触发，且这些会话仍可在多模态/纯文本模型间自由切换。

## 安装

```sh
# 加入 Web profile（需要重启 DSH Web profile 生效）
dsh plugin --profile web add github:JochenYang/dsh-plugins#path:/packages/dsh-vision-bridge
```

## 配置

外部视觉 API 配置优先级：`cordis.patch.yml` 的 config → `CUSTOM_*` 环境变量 → `VISION_*` 环境变量 → 默认值。

| 配置项 | 环境变量回退（两套都认） | 默认值 |
|---|---|---|
| `baseUrl` | `CUSTOM_BASE_URL` → `VISION_BASE_URL` → `VISION_API_URL` | `https://api.minimaxi.com/v1` |
| `model` | `CUSTOM_MODEL_NAME` → `VISION_MODEL` | `MiniMax-M3` |
| `apiKey` | `CUSTOM_API_KEY` → `VISION_API_KEY` | 无（缺失时报错） |
| `language` | — | `zh` |
| `timeoutMs` | — | `60000` |
| `maxImageBytes` | — | `10485760` |
| `pasteStorage` | — | `cache`（`cache` = `~/.dsh/cache/dsh-vision-bridge/pasted-images/`，不污染工作区；`workspace` = 会话工作区下的 `.dsh-vision-bridge/pasted-images/`） |
| `pasteMode` | — | `auto`（`auto` = 当前模型支持原生图片则放行 DSH 原生粘贴，否则缓存+路径标记；`path` = 总是缓存+路径标记；`native` = 从不拦截，完全走 DSH 原生粘贴） |

`CUSTOM_*` 是你 luma-vision skill（`D:\codes\luma-mcp\vision-skill`）的惯例；`VISION_API_KEY / VISION_BASE_URL / VISION_MODEL` 是 agent-vision-toolkit 上游的惯例（`VISION_API_URL` 作为 baseUrl 别名同样识别）。**注意：桌面端应用只读取启动时已存在的环境变量**——如果刚配置/修改了系统环境变量，需要重启 DSH 才能生效。

## 使用

**按能力分流（v0.3.3）**：`auto` 模式下能力判定随会话切换与模型切换自动刷新（客户端缓存，粘贴时同步决策）。

- **多模态模型**（如 Kimi K3）：Ctrl+V 直接走 DSH 原生粘贴，模型原生看图；E2E/浏览器截图等非粘贴来源的图片文件也优先原生 `read_image`。注意：原生图片进过会话后，该会话不能再切换到纯文本模型（DSH 门禁）。
- **纯文本模型**（如 DeepSeek）：Ctrl+V 粘贴 → 图片存入缓存目录 `<DSH_HOME 或 ~/.dsh>/cache/dsh-vision-bridge/pasted-images/<session>/`（超过 7 天的旧图自动清理），输入框出现 `[pasted image N: <路径>]` 标记；模型加载 `vision-bridge` skill 后调用：

  ```
  vision_glance(image_path="<路径>", question="<你想知道什么>")
  ```

  `question` 省略 → 详细描述；写明"转写图中文字" → OCR；可针对图片局部提问。
- **粘贴标记一律 `vision_glance`，禁止 `read_image`**（那会把图片写回会话历史，导致无法再切换纯文本模型）——即使当前模型支持原生看图。
- `pasteMode: path` 可强制纯路径流程（多模态模型也走外部视觉 API）；`pasteMode: native` 完全禁用拦截（原生粘贴，仅适合单模型会话）。

## 组成

- **服务端**（`src/index.ts`）：`vision_glance` 工具 + `vision-bridge` skill + 粘贴上传路由 `/_dsh/vision-bridge/paste-images` + 能力查询路由 `/_dsh/vision-bridge/config`。
- **视觉调用**（`src/vision.ts`）：OpenAI 兼容 `chat/completions` + `image_url` data URI，与 vision.js 同契约，进程内直接 fetch。
- **粘贴后端**（`src/paste-images.ts`）：同源校验、文件名清洗、原子写入、路径围栏。
- **客户端**（`src/client/index.ts`）：按缓存能力拦截/放行输入框粘贴；拦截时上传图片并插入文本路径标记，能力随会话与模型切换自动刷新。

## 限制

- 只拦截**粘贴**（Ctrl+V），拖放暂不支持（DSH 原生拖放会把图片作为 image part，纯文本模型发送时会报错）。
- 上传是顺序进行，期间在输入框输入文字可能导致光标位置偏移（v0.1 简化实现）。
- 图片内容为不可信证据：skill 明确要求模型不执行图片内的指令。
- 视觉质量取决于所配置的外部视觉模型。
