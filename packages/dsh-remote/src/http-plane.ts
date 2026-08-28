/**
 * HTTP reverse-proxy plane (PROTOCOL §5) — the host side.
 *
 * Frames from the relay (`http-req/http-body/http-body-end/http-abort`) are
 * turned into a real request against the local dsh web server; the response
 * streams back as `http-head/http-chunk/http-end` (or `http-err`). One
 * in-flight request per relay id; chunk order is guaranteed by single-reader
 * consumption, so SSE and blob streams survive untouched.
 */

import { HTTP_CHUNK_BYTES, T } from './frames.js'
import type { Frame } from './agent.js'

export type Send = (frame: Frame) => void

const REQUEST_FORBIDDEN = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'expect',
  // `host` is rebuilt from the local origin; content-length from the assembled body.
  'host',
  'content-length',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions',
  'sec-websocket-protocol',
  // Browser-trust attestation must not leak to the local dsh server. Its /api
  // fence (client-connection api-request-trust) requires Origin to equal Host,
  // and the phone page's origin (192.168.5.2:8787) can never match the
  // loopback Host undici attaches here — leaking these makes every /api call
  // 403. Strip the markers so the upstream request reads as the identical
  // loopback client it actually is.
  'origin',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-fetch-user',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'referer',
])

const RESPONSE_FORBIDDEN = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // The response is re-chunked into frames, so a pre-announced length cannot hold.
  'content-length',
])

interface Pending {
  id: number
  method: string
  path: string
  query: string
  headers: Record<string, string>
  chunks: Buffer[]
  started: boolean
  controller: AbortController | undefined
}

export interface HttpPlaneOptions {
  /** Local dsh web origin, e.g. `http://127.0.0.1:5173`. */
  origin: () => string
  log: (message: string) => void
  send: Send
}

export class HttpPlane {
  private readonly pending = new Map<number, Pending>()

  constructor(private readonly options: HttpPlaneOptions) {}

  /** Dispatch a relay frame belonging to the http plane. */
  handle(frame: Frame): void {
    const id = Number(frame.id)
    switch (frame.t) {
      case T.HTTP_REQ: {
        if (this.pending.has(id)) return
        const pending: Pending = {
          id,
          method: typeof frame.method === 'string' ? frame.method : 'GET',
          path: typeof frame.path === 'string' ? frame.path : '/',
          query: typeof frame.query === 'string' ? frame.query : '',
          headers: (frame.headers as Record<string, string>) ?? {},
          chunks: [],
          started: false,
          controller: undefined,
        }
        if (typeof frame.bodyBase64 === 'string' && frame.bodyBase64 !== '') {
          pending.chunks.push(Buffer.from(frame.bodyBase64, 'base64'))
        }
        this.pending.set(id, pending)
        break
      }
      case T.HTTP_BODY: {
        const pending = this.pending.get(id)
        if (pending === undefined || pending.started) break
        pending.chunks.push(Buffer.from(String(frame.dataBase64 ?? ''), 'base64'))
        break
      }
      case T.HTTP_BODY_END: {
        const pending = this.pending.get(id)
        if (pending === undefined || pending.started) break
        pending.started = true
        void this.run(pending)
        break
      }
      case T.HTTP_ABORT: {
        const pending = this.pending.get(id)
        if (pending === undefined) break
        this.pending.delete(id)
        if (pending.controller !== undefined) {
          try { pending.controller.abort() } catch { /* already aborted */ }
        }
        break
      }
      default:
        this.options.log(`http-plane: unexpected frame ${String(frame.t)}`)
    }
  }

  private async run(pending: Pending): Promise<void> {
    try {
      await this.perform(pending)
    } catch (error) {
      const aborted = pending.controller?.signal.aborted
      this.pending.delete(pending.id)
      if (aborted) return // phone is gone — nothing to answer
      this.options.log(`upstream request ${pending.id} failed: ${(error as Error).message}`)
      this.options.send({ t: T.HTTP_ERR, id: pending.id, code: 'UPSTREAM_DOWN', message: (error as Error).message })
    }
  }

  private async perform(pending: Pending): Promise<void> {
    const controller = new AbortController()
    pending.controller = controller

    const method = pending.method
    const hasBody = method !== 'GET' && method !== 'HEAD'
    const body = hasBody
      ? (pending.chunks.length === 0 ? undefined : Buffer.concat(pending.chunks))
      : undefined

    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(pending.headers)) {
      const lower = key.toLowerCase()
      if (REQUEST_FORBIDDEN.has(lower)) continue
      headers[lower] = value
    }

    const response = await fetch(this.options.origin() + pending.path + pending.query, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
    })

    // Response head — hop-by-hop and length headers stripped for frame re-chunking.
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (RESPONSE_FORBIDDEN.has(lower)) return
      responseHeaders[lower] = value
    })
    this.options.send({ t: T.HTTP_HEAD, id: pending.id, status: response.status, headers: responseHeaders })

    if (response.body === null) {
      this.pending.delete(pending.id)
      this.options.send({ t: T.HTTP_END, id: pending.id })
      return
    }

    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength > 0) {
        for (let offset = 0; offset < value.byteLength; offset += HTTP_CHUNK_BYTES) {
          const piece = value.subarray(offset, offset + HTTP_CHUNK_BYTES)
          const chunk = Buffer.from(piece)
          this.options.send({ t: T.HTTP_CHUNK, id: pending.id, dataBase64: chunk.toString('base64') })
        }
      }
    }
    // Release the controller so a late abort after stream end is ignored.
    this.pending.delete(pending.id)
    this.options.send({ t: T.HTTP_END, id: pending.id })
  }
}