/**
 * External vision API client for dsh-vision-bridge.
 *
 * OpenAI-compatible chat/completions with an image_url data URI — the same
 * contract as the luma-vision skill script
 * (D:\codes\luma-mcp\vision-skill\scripts\vision.js), but as an in-process
 * call so no Node subprocess is needed. Configuration falls back to the
 * CUSTOM_BASE_URL / CUSTOM_MODEL_NAME / CUSTOM_API_KEY environment variables
 * the skill already uses.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

/** Supported raster media types by file extension. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export interface VisionConfig {
  baseUrl: string
  model: string
  apiKey: string
  language: 'zh' | 'en'
  timeoutMs: number
  maxImageBytes: number
}

export interface VisionConfigInput {
  baseUrl?: string
  model?: string
  apiKey?: string
  language?: string
  timeoutMs?: number
  maxImageBytes?: number
}

/** First non-empty value; an explicit empty string counts as unset. */
function pick(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return ''
}

/**
 * Resolve the vision endpoint from plugin config, then the environment the
 * luma-vision skill already uses (CUSTOM_*), then the agent-vision-toolkit
 * set (VISION_API_KEY / VISION_BASE_URL / VISION_MODEL, with VISION_API_URL
 * accepted as a base-URL alias), then built-in defaults.
 */
export function resolveVisionConfig(partial: VisionConfigInput): VisionConfig {
  const baseUrl = pick(
    partial.baseUrl,
    process.env.CUSTOM_BASE_URL,
    process.env.VISION_BASE_URL,
    process.env.VISION_API_URL,
    'https://api.minimaxi.com/v1',
  ).replace(/\/+$/u, '')
  const model = pick(partial.model, process.env.CUSTOM_MODEL_NAME, process.env.VISION_MODEL, 'MiniMax-M3')
  const apiKey = pick(partial.apiKey, process.env.CUSTOM_API_KEY, process.env.VISION_API_KEY)
  const language = partial.language === 'en' ? 'en' : 'zh'
  const timeoutMs = partial.timeoutMs ?? 60_000
  const maxImageBytes = partial.maxImageBytes ?? 10 * 1024 * 1024
  if (baseUrl === '') throw new Error('vision_glance: no vision API base URL (set config.baseUrl or CUSTOM_BASE_URL)')
  if (model === '') throw new Error('vision_glance: no vision model (set config.model or CUSTOM_MODEL_NAME)')
  if (apiKey === '') throw new Error('vision_glance: no vision API key (set config.apiKey or CUSTOM_API_KEY)')
  return { baseUrl, model, apiKey, language, timeoutMs, maxImageBytes }
}

/** Best-effort session workspace from the calling agent. */
function sessionCwd(exec: ToolExecution): string | undefined {
  const agent = exec.agent as unknown as { session?: { header?: { cwd?: string } } } | undefined
  const cwd = agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

export interface GlanceResult {
  image: string
  mode: 'describe' | 'qa'
  answer: string
  model: string
  bytes: number
  elapsedMs: number
}

/**
 * Read the image, send it to the configured vision API, and return the answer.
 * @param options - the tool execution (for the session cwd and cancellation),
 *   the raw image path, the focus-hint question, and the resolved config.
 */
export async function runVisionGlance(options: {
  exec: ToolExecution
  imagePath: string
  question?: string
  config: VisionConfig
}): Promise<GlanceResult> {
  const { exec, imagePath, question, config } = options

  const fullPath = isAbsolute(imagePath) ? imagePath : resolve(sessionCwd(exec) ?? process.cwd(), imagePath)
  if (!existsSync(fullPath)) throw new Error(`vision_glance: image not found: ${fullPath}`)
  const mediaType = MIME_BY_EXTENSION[extname(fullPath).toLowerCase()]
  if (mediaType === undefined) {
    throw new Error('vision_glance: only PNG/JPG/JPEG/WebP/GIF images are supported')
  }
  const stat = statSync(fullPath)
  if (!stat.isFile()) throw new Error(`vision_glance: not a file: ${fullPath}`)
  if (stat.size === 0) throw new Error(`vision_glance: image is empty: ${fullPath}`)
  if (stat.size > config.maxImageBytes) {
    throw new Error(`vision_glance: image is ${stat.size} bytes, exceeding the ${config.maxImageBytes}-byte limit`)
  }

  const data = readFileSync(fullPath)
  const prompt = question === undefined || question.trim() === ''
    ? config.language === 'en'
      ? 'Describe this image in detail. Structure your answer as follows:\n1. Scene Overview: what this image is (screenshot, photo, chart, document, etc.)\n2. Key Details: all visible elements in structured form (UI: layout, components, text, colors, states; charts: data points, labels, trends; photos: subjects, composition, visible text/signs)\n3. Text Extraction (OCR): transcribe ALL visible text in order, preserving formatting where possible\n4. Notable Observations: anything unusual, errors, or noteworthy\nStay factual; do not speculate beyond the image. If the image is unclear, note which parts are legible.'
      : '请详细描述这张图片。按以下结构输出：\n1. 场景概述：这张图是什么（截图、照片、图表、文档等）\n2. 关键细节：结构化列出所有可见元素（界面：布局、组件、文字、颜色、状态；图表：数据点、标签、趋势；照片：主体、构图、可见文字/标识）\n3. 文字转录（OCR）：按顺序逐行转录图中所有可见文字，尽量保留原格式\n4. 注意事项：任何异常、错误或值得注意的信息\n回答保持事实性，不要猜测图片之外的内容；图片不清晰时注明哪些部分可辨认。'
    : question.trim()

  const started = Date.now()
  const combined = AbortSignal.any([exec.signal, AbortSignal.timeout(config.timeoutMs)])
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${data.toString('base64')}` } },
            ],
          },
        ],
        max_tokens: 8192,
      }),
      signal: combined,
    })
  } catch (error) {
    if (exec.signal.aborted) throw new Error('vision_glance: cancelled')
    throw new Error(`vision_glance: vision API request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`vision_glance: vision API error (${response.status}): ${body.slice(0, 400)}`)
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
  const answer = payload.choices?.[0]?.message?.content
  if (typeof answer !== 'string' || answer.length === 0) {
    throw new Error('vision_glance: vision API returned no content')
  }
  return {
    image: fullPath,
    mode: question === undefined || question.trim() === '' ? 'describe' : 'qa',
    answer,
    model: config.model,
    bytes: stat.size,
    elapsedMs: Date.now() - started,
  }
}
