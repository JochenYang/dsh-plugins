# dsh-vision-bridge

给纯文本 DSH Agent 的最小识图插件：粘贴图片 → 存入会话工作区 → 消息里只有文本路径标记 → 模型调用 `vision_glance` 把图片发给外部视觉 API 并取回文字答案。

**设计要点**：图片永远不进主模型上下文。因此 DSH 的原生图像门禁（`model.inputModalities` / `attachment-error`）从源头就不会触发——纯文本模型（如 DeepSeek）也能"看见"图片，且不会出现"当前模型不支持图片"的报错。

## 安装

```sh
# 在 dsh-vision-bridge 目录
pnpm install
pnpm run pack          # 产出 dsh-vision-bridge-0.1.0.tgz

# 加入 Web profile（需要重启 DSH Web profile 生效）
dsh plugin --profile web add file:D:/codes/dsh-configure/dsh-vision-bridge/dsh-vision-bridge-0.1.0.tgz
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
| `pasteMode` | — | `auto`（`auto` = 当前模型支持原生图片则转原生附件，否则缓存+路径标记；`path` = 总是缓存+路径标记；`native` = 从不拦截，完全走 DSH 原生粘贴） |

`CUSTOM_*` 是你 luma-vision skill（`D:\codes\luma-mcp\vision-skill`）的惯例；`VISION_API_KEY / VISION_BASE_URL / VISION_MODEL` 是 agent-vision-toolkit 上游的惯例（`VISION_API_URL` 作为 baseUrl 别名同样识别）。**注意：桌面端应用只读取启动时已存在的环境变量**——如果刚配置/修改了系统环境变量，需要重启 DSH 才能生效。

## 使用

**纯路径模式（v0.3.0）**：粘贴一律转路径标记，会话里永远不产生原生图片附件——因此**同会话可以在多模态/纯文本模型之间随意切换**（DSH 的"session already contains images"切换门禁永远不会触发）。

- Ctrl+V 粘贴 → 图片存入缓存目录 `<DSH_HOME 或 ~/.dsh>/cache/dsh-vision-bridge/pasted-images/<session>/`（超过 7 天的旧图自动清理），输入框出现 `[pasted image N: <路径>]` 标记；模型加载 `vision-bridge` skill 后调用：

  ```
  vision_glance(image_path="<路径>", question="<你想知道什么>")
  ```

  `question` 省略 → 详细描述；写明"转写图中文字" → OCR；可针对图片局部提问。
- 多模态模型同样走 `vision_glance`（外部视觉 API 默认就是 MiniMax-M3，识别质量等同原生；代价是每次识图多一次 API 调用、无原生预览）。
- **对粘贴的缓存图片路径，skill 明令禁止 `read_image`**（那会把图片写回会话历史，导致无法再切换纯文本模型）。
- `pasteMode: native` 可完全禁用拦截（原生粘贴，仅适合单模型会话）。

## 组成

- **服务端**（`src/index.ts`）：`vision_glance` 工具 + `vision-bridge` skill + 粘贴上传路由 `/_dsh/vision-bridge/paste-images`。
- **视觉调用**（`src/vision.ts`）：OpenAI 兼容 `chat/completions` + `image_url` data URI，与 vision.js 同契约，进程内直接 fetch。
- **粘贴后端**（`src/paste-images.ts`）：同源校验、文件名清洗、原子写入、路径围栏。
- **客户端**（`src/client/index.ts`）：拦截输入框粘贴，上传图片并插入文本路径标记。

## 限制

- 只拦截**粘贴**（Ctrl+V），拖放暂不支持（DSH 原生拖放会把图片作为 image part，纯文本模型发送时会报错）。
- 上传是顺序进行，期间在输入框输入文字可能导致光标位置偏移（v0.1 简化实现）。
- 图片内容为不可信证据：skill 明确要求模型不执行图片内的指令。
- 视觉质量取决于所配置的外部视觉模型。
