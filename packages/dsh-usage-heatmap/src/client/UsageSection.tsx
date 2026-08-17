/**
 * dsh-usage-heatmap settings section: a native React surface (no iframe) that
 * fetches the plugin's same-origin JSON API and renders the usage heatmap,
 * per-model breakdown, and daily trend chart. All styling uses the shared
 * `--dsw-alias-*` tokens, so the section follows the shell theme natively.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// API types (structural mirrors of the host bundle's aggregates)
// ---------------------------------------------------------------------------

interface Agg {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  billedInputTokens: number
  cacheHitRate: number
  cost: number
}

interface ModelAgg extends Agg {
  provider: string
  model: string
  share: number
}

interface DailyAgg extends Agg {
  date: string
}

interface SummaryValue {
  since: number
  until: number
  totals: Agg
  models: ModelAgg[]
  daily: DailyAgg[]
}

interface DayCell {
  date: string
  requests: number
  totalTokens: number
  cacheHitRate: number
}

interface HeatValue {
  weeks: number
  since: number
  until: number
  cells: DayCell[]
}

interface TooltipState {
  text: string[]
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// formatting helpers
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function fmtInt(n: number): string {
  return n >= 1e6 ? fmtTokens(n) : String(n)
}

function fmtCost(n: number): string {
  return n <= 0 ? '—' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`
}

function fmtPct(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  const body = await response.json() as { ok: boolean; value?: T; error?: { message?: string } }
  if (!response.ok || body.ok !== true) {
    throw new Error(body.error?.message ?? `HTTP ${response.status}`)
  }
  return body.value as T
}

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

function Cards({ totals }: { totals: Agg }) {
  const items: Array<[string, string, string]> = [
    ['请求数', fmtInt(totals.requests), ''],
    ['输入 tokens（未命中缓存）', fmtTokens(totals.inputTokens), ''],
    ['输出 tokens', fmtTokens(totals.outputTokens), ''],
    ['缓存命中率', fmtPct(totals.cacheHitRate),
      `${fmtTokens(totals.cacheReadTokens)} 读 / ${fmtTokens(totals.inputTokens + totals.cacheWriteTokens)} 未命中`],
    ['缓存读 tokens', fmtTokens(totals.cacheReadTokens), ''],
    ['缓存写 tokens', fmtTokens(totals.cacheWriteTokens), ''],
    ['推理 tokens', fmtTokens(totals.reasoningTokens), ''],
    ['估算成本', fmtCost(totals.cost), totals.cost > 0 ? '按配置定价表' : '未配置定价'],
  ]
  return (
    <div className="dsh_uh_cards">
      {items.map(([label, value, sub]) => (
        <div className="dsh_uh_card" key={label}>
          <div className="dsh_uh_cardLabel">{label}</div>
          <div className="dsh_uh_cardValue">{value}</div>
          {sub !== '' && <div className="dsh_uh_cardSub" title={sub}>{sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// calendar heatmap (explicit grid placement: month row + weekday column +
// week columns, so labels can never drift)
// ---------------------------------------------------------------------------

function cellLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  const ratio = value / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

function HeatCalendar({
  heat,
  metric,
  onTip,
}: {
  heat: HeatValue
  metric: 'tokens' | 'requests'
  onTip: (tip: TooltipState | null) => void
}) {
  const { cells, weeks } = heat
  const max = cells.reduce((m, cell) => {
    const v = metric === 'tokens' ? cell.totalTokens : cell.requests
    return v > m ? v : m
  }, 0)

  const dows = ['日', '一', '二', '三', '四', '五', '六']
  // Weekday of the window's first cell. Labels and data rows are both derived
  // from it, so they always match (previously the calendar shifted by one row
  // whenever the window did not start on a Sunday).
  const firstDow = new Date(`${cells[0].date}T00:00:00`).getDay()

  // One compact month label ("2月", "3月", …) per week where the month
  // changes. Two characters always fit the tightest case (a month-start only
  // two columns ≈ 32px after the previous label), so labels can never collide
  // regardless of font; the full year is shown in the panel title instead.
  const monthLabels: string[] = []
  const monthSpans: number[] = []
  for (let w = 0; w < weeks; w += 1) {
    const date = cells[w * 7].date
    const prev = w > 0 ? cells[(w - 1) * 7].date : ''
    monthLabels.push(w === 0 || date.slice(0, 7) !== prev.slice(0, 7) ? `${Number(date.slice(5, 7))}月` : '')
    monthSpans.push(0)
  }
  let nextLabel = weeks
  for (let w = weeks - 1; w >= 0; w -= 1) {
    if (monthLabels[w] === '') continue
    monthSpans[w] = Math.max(1, nextLabel - w)
    nextLabel = w
  }

  return (
    <div
      className="dsh_uh_calendar"
      style={{
        gridTemplateColumns: `26px repeat(${weeks}, 13px)`,
        gridTemplateRows: '16px repeat(7, 13px)',
      }}
    >
      <div style={{ gridRow: 1, gridColumn: 1 }} />
      {monthLabels.map((label, w) => label !== '' && (
        <div className="dsh_uh_calMonth" key={`m${w}`} style={{ gridRow: 1, gridColumn: `${w + 2} / span ${monthSpans[w]}` }}>
          {label}
        </div>
      ))}
      {dows.map((_dow, d) => (
        <div className="dsh_uh_calDow" key={`d${d}`} style={{ gridRow: d + 2, gridColumn: 1 }}>
          {dows[(firstDow + d) % 7]}
        </div>
      ))}
      {cells.map((cell, i) => {
        const week = Math.floor(i / 7)
        const dow = i % 7
        const value = metric === 'tokens' ? cell.totalTokens : cell.requests
        const level = cellLevel(value, max)
        return (
          <div
            key={cell.date}
            className="dsh_uh_calCell"
            data-level={level}
            style={{ gridRow: dow + 2, gridColumn: week + 2 }}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onTip({
                text: [
                  cell.date,
                  `请求 ${cell.requests} · 总 tokens ${fmtTokens(cell.totalTokens)}`,
                  `缓存命中率 ${fmtPct(cell.cacheHitRate)}`,
                ],
                x: rect.left + rect.width / 2,
                y: rect.top,
              })
            }}
            onMouseMove={(event) => {
              onTip({
                text: [
                  cell.date,
                  `请求 ${cell.requests} · 总 tokens ${fmtTokens(cell.totalTokens)}`,
                  `缓存命中率 ${fmtPct(cell.cacheHitRate)}`,
                ],
                x: event.clientX + 14,
                y: event.clientY + 14,
              })
            }}
            onMouseLeave={() => { onTip(null) }}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// model table
// ---------------------------------------------------------------------------

function ModelTable({ models }: { models: ModelAgg[] }) {
  if (models.length === 0) {
    return <div className="dsh_uh_empty">暂无数据</div>
  }
  return (
    <div className="dsh_uh_tableWrap">
      <table className="dsh_uh_table">
        <thead>
        <tr>
          <th>模型</th>
          <th>请求</th>
          <th>输入</th>
          <th>输出</th>
          <th>缓存读</th>
          <th>缓存写</th>
          <th>命中率</th>
          <th>成本</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>
        {models.map(model => (
          <tr key={`${model.provider}/${model.model}`}>
            <td title={model.provider}>{model.model}</td>
            <td>{fmtInt(model.requests)}</td>
            <td>{fmtTokens(model.inputTokens)}</td>
            <td>{fmtTokens(model.outputTokens)}</td>
            <td>{fmtTokens(model.cacheReadTokens)}</td>
            <td>{fmtTokens(model.cacheWriteTokens)}</td>
            <td>{fmtPct(model.cacheHitRate)}</td>
            <td>{fmtCost(model.cost)}</td>
            <td>
              <span className="dsh_uh_share">
                {fmtPct(model.share)}
                <span className="dsh_uh_shareBar" style={{ width: `${Math.max(4, Math.round(model.share * 100))}px` }} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// daily trend chart (stacked bars + cache hit rate line, hand-rolled SVG)
// ---------------------------------------------------------------------------

const SEGMENT_COLORS = {
  input: 'var(--dsw-alias-brand-primary)',
  cacheRead: 'var(--dsw-alias-state-success-primary)',
  cacheWrite: 'var(--dsw-alias-state-warn-primary)',
  output: 'var(--dsw-alias-state-business-primary)',
}

function DailyChart({ daily, onTip }: { daily: DailyAgg[]; onTip: (tip: TooltipState | null) => void }) {
  const W = 680
  const H = 240
  const padL = 56
  const padR = 12
  const padT = 14
  const padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const max = daily.reduce((m, d) => Math.max(m, d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens + d.outputTokens), 0) || 1
  const bw = plotW / daily.length
  const xLabelStep = Math.max(1, Math.ceil(daily.length / 8))
  const [hover, setHover] = useState<number | null>(null)

  const showTip = (d: DailyAgg, x: number, y: number): void => {
    onTip({
      text: [
        d.date,
        `请求 ${fmtInt(d.requests)} · 命中率 ${fmtPct(d.cacheHitRate)}`,
        `未命中输入 ${fmtTokens(d.inputTokens)} · 缓存读 ${fmtTokens(d.cacheReadTokens)}`,
        `缓存写 ${fmtTokens(d.cacheWriteTokens)} · 输出 ${fmtTokens(d.outputTokens)}`,
        `成本 ${fmtCost(d.cost)}`,
      ],
      x,
      y,
    })
  }

  return (
    <svg className="dsh_uh_chart" viewBox={`0 0 ${W} ${H}`}>
      {[0, 1, 2, 3].map(g => {
        const gy = padT + plotH * g / 3
        return (
          <g key={g}>
            <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--dsw-alias-border-l1)" strokeWidth={1} />
            <text x={padL - 6} y={gy + 3} textAnchor="end">{fmtTokens(max * (3 - g) / 3)}</text>
          </g>
        )
      })}
      {daily.map((d, i) => {
        const x = padL + i * bw
        const baseY = padT + plotH
        const segments: Array<[number, string]> = [
          [d.inputTokens / max * plotH, SEGMENT_COLORS.input],
          [d.cacheReadTokens / max * plotH, SEGMENT_COLORS.cacheRead],
          [d.cacheWriteTokens / max * plotH, SEGMENT_COLORS.cacheWrite],
          [d.outputTokens / max * plotH, SEGMENT_COLORS.output],
        ]
        let y = baseY
        return (
          <g key={d.date}>
            {segments.map(([h, color], s) => {
              y -= h
              return <rect key={s} x={x} y={y} width={Math.max(1, bw - 2)} height={Math.max(0, h)} rx={1} fill={color} />
            })}
            {i % xLabelStep === 0 && (
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{d.date.slice(5)}</text>
            )}
          </g>
        )
      })}
      <polyline
        points={daily.map((d, i) => {
          const x = padL + i * bw + bw / 2
          const y = padT + plotH - d.cacheHitRate * plotH
          return `${x},${y}`
        }).join(' ')}
        fill="none"
        stroke="var(--dsw-alias-label-primary)"
        strokeWidth={1.4}
      />
      {daily.map((d, i) => (
        <circle
          key={`dot${d.date}`}
          cx={padL + i * bw + bw / 2}
          cy={padT + plotH - d.cacheHitRate * plotH}
          r={1.8}
          fill="var(--dsw-alias-label-primary)"
        />
      ))}
      {/* Hover layer: one full-height hit area per day (on top of everything),
          plus a dashed outline on the hovered column. */}
      {daily.map((d, i) => {
        const x = padL + i * bw
        return (
          <g key={`hit${d.date}`}>
            <rect
              x={x}
              y={padT}
              width={bw}
              height={plotH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={(event) => {
                setHover(i)
                showTip(d, event.clientX + 14, event.clientY + 14)
              }}
              onMouseMove={(event) => showTip(d, event.clientX + 14, event.clientY + 14)}
              onMouseLeave={() => {
                setHover(null)
                onTip(null)
              }}
            />
            {hover === i && (
              <rect
                x={x + 0.5}
                y={padT + 0.5}
                width={bw - 1}
                height={plotH - 1}
                fill="none"
                stroke="var(--dsw-alias-label-primary)"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// section
// ---------------------------------------------------------------------------

const API_BASE = '/_dsh/usage-heatmap/api'

export function UsageSection() {
  const [range, setRange] = useState(30)
  const [metric, setMetric] = useState<'tokens' | 'requests'>('tokens')
  const [auto, setAuto] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<SummaryValue | null>(null)
  const [heat, setHeat] = useState<HeatValue | null>(null)
  const [tip, setTip] = useState<TooltipState | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    try {
      const [nextSummary, nextHeat] = await Promise.all([
        fetchJson<SummaryValue>(`${API_BASE}/summary?days=${range}`),
        fetchJson<HeatValue>(`${API_BASE}/heatmap?weeks=26`),
      ])
      setSummary(nextSummary)
      setHeat(nextHeat)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }, [range])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!auto) return
    const timer = setInterval(() => { void load() }, 30_000)
    return () => { clearInterval(timer) }
  }, [auto, load])

  // Keep the tooltip inside the viewport (clamped on all sides).
  useEffect(() => {
    const node = tipRef.current
    if (node === null || tip === null) return
    const rect = node.getBoundingClientRect()
    let { x, y } = tip
    if (x + rect.width > window.innerWidth - 8) x = x - rect.width - 28
    if (y + rect.height > window.innerHeight - 8) y = y - rect.height - 14
    node.style.left = `${Math.max(8, x)}px`
    node.style.top = `${Math.max(8, y)}px`
  }, [tip])

  return (
    <section className="dsh_uh_section" aria-labelledby="dsh-usage-heatmap-title">
      <div className="dsh_uh_header">
        <h2 id="dsh-usage-heatmap-title" className="dsh_uh_title">用量统计</h2>
        <div className="dsh_uh_tabs" role="tablist" aria-label="统计区间">
          {[7, 30, 90, 365].map(days => (
            <button
              key={days}
              type="button"
              role="tab"
              aria-selected={range === days}
              className="dsh_uh_tab"
              onClick={() => { setRange(days) }}
            >
              {days}天
            </button>
          ))}
        </div>
        <button
          type="button"
          className="dsh_uh_secondaryButton"
          onClick={() => { setMetric(metric === 'tokens' ? 'requests' : 'tokens') }}
          title="切换热力图着色依据"
        >
          热力依据：{metric === 'tokens' ? 'Tokens' : '请求数'}
        </button>
        <button type="button" className="dsh_uh_secondaryButton" onClick={() => { void load() }}>
          刷新
        </button>
        <label className="dsh_uh_autoToggle">
          <input type="checkbox" checked={auto} onChange={event => { setAuto(event.target.checked) }} />
          自动刷新
        </label>
        <a className="dsh_uh_link" href="/_dsh/usage-heatmap/" target="_blank" rel="noreferrer">
          在独立标签页打开 ↗
        </a>
      </div>

      <div className="dsh_uh_banner" style={{ display: error === '' ? 'none' : 'block' }}>
        加载失败：{error}（插件宿主未重启？）
      </div>

      {summary === null && heat === null && error === '' ? (
        <div className="dsh_uh_empty">加载中…</div>
      ) : summary !== null && summary.totals.requests === 0 ? (
        <div className="dsh_uh_empty">
          暂无用量数据。插件启动后会自动回填历史会话日志；重启 DSH 后稍等片刻再刷新。
        </div>
      ) : (
        <>
          {summary !== null && <Cards totals={summary.totals} />}

          <div className="dsh_uh_panel">
            <div className="dsh_uh_header">
              <h3 className="dsh_uh_panelTitle">
                每日热力（最近 26 周{heat !== null ? ` · ${fmtDate(heat.since)} ~ ${fmtDate(heat.until)}` : ''}）
              </h3>
              <div className="dsh_uh_legend">
                少
                {[0, 1, 2, 3, 4].map(level => (
                  <span className="dsh_uh_legendCell" data-level={level} key={level} />
                ))}
                多
              </div>
            </div>
            {heat !== null && <HeatCalendar heat={heat} metric={metric} onTip={setTip} />}
          </div>

          <div className="dsh_uh_row2">
            <div className="dsh_uh_panel">
              <h3 className="dsh_uh_panelTitle">按模型用量（近 {range} 天）</h3>
              <ModelTable models={summary?.models ?? []} />
            </div>
            <div className="dsh_uh_panel">
              <h3 className="dsh_uh_panelTitle">
                每日趋势（近 {range} 天：未命中输入 / 缓存读 / 缓存写 / 输出，白线 = 命中率）
              </h3>
              <DailyChart daily={summary?.daily ?? []} onTip={setTip} />
            </div>
          </div>

          <div className="dsh_uh_footer">
            数据来自本机会话日志（assistant/message.usage）。仅统计适配器上报了 token 记账的请求；
            缓存命中率 = 缓存读 /（未命中输入 + 缓存读 + 缓存写）。成本为估算值，按插件配置的定价表计算。
          </div>
        </>
      )}

      <div
        ref={tipRef}
        className="dsh_uh_tooltip"
        style={{ display: tip === null ? 'none' : 'block' }}
      >
        {tip !== null && tip.text.map(line => (
          <div key={line} className={line.length < 12 ? 'dsh_uh_tooltipTitle' : undefined}>{line}</div>
        ))}
      </div>
    </section>
  )
}
