// test/render-smoke.entry.tsx
import * as React from "react";
import { renderToString } from "react-dom/server";

// src/client/UsageSection.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function fmtTokens(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function fmtInt(n) {
  return n >= 1e6 ? fmtTokens(n) : String(n);
}
function fmtCost(n) {
  return n <= 0 ? "\u2014" : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
}
function fmtPct(r) {
  return `${(r * 100).toFixed(1)}%`;
}
function fmtDate(ms) {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  }
  return body.value;
}
function Cards({ totals }) {
  const items = [
    ["\u8BF7\u6C42\u6570", fmtInt(totals.requests), ""],
    ["\u8F93\u5165 tokens\uFF08\u672A\u547D\u4E2D\u7F13\u5B58\uFF09", fmtTokens(totals.inputTokens), ""],
    ["\u8F93\u51FA tokens", fmtTokens(totals.outputTokens), ""],
    [
      "\u7F13\u5B58\u547D\u4E2D\u7387",
      fmtPct(totals.cacheHitRate),
      `${fmtTokens(totals.cacheReadTokens)} \u8BFB / ${fmtTokens(totals.inputTokens + totals.cacheWriteTokens)} \u672A\u547D\u4E2D`
    ],
    ["\u7F13\u5B58\u8BFB tokens", fmtTokens(totals.cacheReadTokens), ""],
    ["\u7F13\u5B58\u5199 tokens", fmtTokens(totals.cacheWriteTokens), ""],
    ["\u63A8\u7406 tokens", fmtTokens(totals.reasoningTokens), ""],
    ["\u4F30\u7B97\u6210\u672C", fmtCost(totals.cost), totals.cost > 0 ? "\u6309\u914D\u7F6E\u5B9A\u4EF7\u8868" : "\u672A\u914D\u7F6E\u5B9A\u4EF7"]
  ];
  return /* @__PURE__ */ jsx("div", { className: "dsh_uh_cards", children: items.map(([label, value, sub]) => /* @__PURE__ */ jsxs("div", { className: "dsh_uh_card", children: [
    /* @__PURE__ */ jsx("div", { className: "dsh_uh_cardLabel", children: label }),
    /* @__PURE__ */ jsx("div", { className: "dsh_uh_cardValue", children: value }),
    sub !== "" && /* @__PURE__ */ jsx("div", { className: "dsh_uh_cardSub", title: sub, children: sub })
  ] }, label)) });
}
function cellLevel(value, max) {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}
function HeatCalendar({
  heat,
  metric,
  onTip
}) {
  const { cells, weeks } = heat;
  const max = cells.reduce((m, cell) => {
    const v = metric === "tokens" ? cell.totalTokens : cell.requests;
    return v > m ? v : m;
  }, 0);
  const dows = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
  const firstDow = (/* @__PURE__ */ new Date(`${cells[0].date}T00:00:00`)).getDay();
  const monthLabels = [];
  const monthSpans = [];
  for (let w = 0; w < weeks; w += 1) {
    const date = cells[w * 7].date;
    const prev = w > 0 ? cells[(w - 1) * 7].date : "";
    monthLabels.push(w === 0 || date.slice(0, 7) !== prev.slice(0, 7) ? `${Number(date.slice(5, 7))}\u6708` : "");
    monthSpans.push(0);
  }
  let nextLabel = weeks;
  for (let w = weeks - 1; w >= 0; w -= 1) {
    if (monthLabels[w] === "") continue;
    monthSpans[w] = Math.max(1, nextLabel - w);
    nextLabel = w;
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "dsh_uh_calendar",
      style: {
        gridTemplateColumns: `26px repeat(${weeks}, 13px)`,
        gridTemplateRows: "16px repeat(7, 13px)"
      },
      children: [
        /* @__PURE__ */ jsx("div", { style: { gridRow: 1, gridColumn: 1 } }),
        monthLabels.map((label, w) => label !== "" && /* @__PURE__ */ jsx("div", { className: "dsh_uh_calMonth", style: { gridRow: 1, gridColumn: `${w + 2} / span ${monthSpans[w]}` }, children: label }, `m${w}`)),
        dows.map((_dow, d) => /* @__PURE__ */ jsx("div", { className: "dsh_uh_calDow", style: { gridRow: d + 2, gridColumn: 1 }, children: dows[(firstDow + d) % 7] }, `d${d}`)),
        cells.map((cell, i) => {
          const week = Math.floor(i / 7);
          const dow = i % 7;
          const value = metric === "tokens" ? cell.totalTokens : cell.requests;
          const level = cellLevel(value, max);
          return /* @__PURE__ */ jsx(
            "div",
            {
              className: "dsh_uh_calCell",
              "data-level": level,
              style: { gridRow: dow + 2, gridColumn: week + 2 },
              onMouseEnter: (event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onTip({
                  text: [
                    cell.date,
                    `\u8BF7\u6C42 ${cell.requests} \xB7 \u603B tokens ${fmtTokens(cell.totalTokens)}`,
                    `\u7F13\u5B58\u547D\u4E2D\u7387 ${fmtPct(cell.cacheHitRate)}`
                  ],
                  x: rect.left + rect.width / 2,
                  y: rect.top
                });
              },
              onMouseMove: (event) => {
                onTip({
                  text: [
                    cell.date,
                    `\u8BF7\u6C42 ${cell.requests} \xB7 \u603B tokens ${fmtTokens(cell.totalTokens)}`,
                    `\u7F13\u5B58\u547D\u4E2D\u7387 ${fmtPct(cell.cacheHitRate)}`
                  ],
                  x: event.clientX + 14,
                  y: event.clientY + 14
                });
              },
              onMouseLeave: () => {
                onTip(null);
              }
            },
            cell.date
          );
        })
      ]
    }
  );
}
function ModelTable({ models }) {
  if (models.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "dsh_uh_empty", children: "\u6682\u65E0\u6570\u636E" });
  }
  return /* @__PURE__ */ jsx("div", { className: "dsh_uh_tableWrap", children: /* @__PURE__ */ jsxs("table", { className: "dsh_uh_table", children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { children: "\u6A21\u578B" }),
      /* @__PURE__ */ jsx("th", { children: "\u8BF7\u6C42" }),
      /* @__PURE__ */ jsx("th", { children: "\u8F93\u5165" }),
      /* @__PURE__ */ jsx("th", { children: "\u8F93\u51FA" }),
      /* @__PURE__ */ jsx("th", { children: "\u7F13\u5B58\u8BFB" }),
      /* @__PURE__ */ jsx("th", { children: "\u7F13\u5B58\u5199" }),
      /* @__PURE__ */ jsx("th", { children: "\u547D\u4E2D\u7387" }),
      /* @__PURE__ */ jsx("th", { children: "\u6210\u672C" }),
      /* @__PURE__ */ jsx("th", { children: "\u5360\u6BD4" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: models.map((model) => /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("td", { title: model.provider, children: model.model }),
      /* @__PURE__ */ jsx("td", { children: fmtInt(model.requests) }),
      /* @__PURE__ */ jsx("td", { children: fmtTokens(model.inputTokens) }),
      /* @__PURE__ */ jsx("td", { children: fmtTokens(model.outputTokens) }),
      /* @__PURE__ */ jsx("td", { children: fmtTokens(model.cacheReadTokens) }),
      /* @__PURE__ */ jsx("td", { children: fmtTokens(model.cacheWriteTokens) }),
      /* @__PURE__ */ jsx("td", { children: fmtPct(model.cacheHitRate) }),
      /* @__PURE__ */ jsx("td", { children: fmtCost(model.cost) }),
      /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsxs("span", { className: "dsh_uh_share", children: [
        fmtPct(model.share),
        /* @__PURE__ */ jsx("span", { className: "dsh_uh_shareBar", style: { width: `${Math.max(4, Math.round(model.share * 100))}px` } })
      ] }) })
    ] }, `${model.provider}/${model.model}`)) })
  ] }) });
}
var SEGMENT_COLORS = {
  input: "var(--dsw-alias-brand-primary)",
  cacheRead: "var(--dsw-alias-state-success-primary)",
  cacheWrite: "var(--dsw-alias-state-warn-primary)",
  output: "var(--dsw-alias-state-business-primary)"
};
function DailyChart({ daily, onTip }) {
  const W = 680;
  const H = 240;
  const padL = 56;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = daily.reduce((m, d) => Math.max(m, d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens + d.outputTokens), 0) || 1;
  const bw = plotW / daily.length;
  const xLabelStep = Math.max(1, Math.ceil(daily.length / 8));
  const [hover, setHover] = useState(null);
  const showTip = (d, x, y) => {
    onTip({
      text: [
        d.date,
        `\u8BF7\u6C42 ${fmtInt(d.requests)} \xB7 \u547D\u4E2D\u7387 ${fmtPct(d.cacheHitRate)}`,
        `\u672A\u547D\u4E2D\u8F93\u5165 ${fmtTokens(d.inputTokens)} \xB7 \u7F13\u5B58\u8BFB ${fmtTokens(d.cacheReadTokens)}`,
        `\u7F13\u5B58\u5199 ${fmtTokens(d.cacheWriteTokens)} \xB7 \u8F93\u51FA ${fmtTokens(d.outputTokens)}`,
        `\u6210\u672C ${fmtCost(d.cost)}`
      ],
      x,
      y
    });
  };
  return /* @__PURE__ */ jsxs("svg", { className: "dsh_uh_chart", viewBox: `0 0 ${W} ${H}`, children: [
    [0, 1, 2, 3].map((g) => {
      const gy = padT + plotH * g / 3;
      return /* @__PURE__ */ jsxs("g", { children: [
        /* @__PURE__ */ jsx("line", { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: "var(--dsw-alias-border-l1)", strokeWidth: 1 }),
        /* @__PURE__ */ jsx("text", { x: padL - 6, y: gy + 3, textAnchor: "end", children: fmtTokens(max * (3 - g) / 3) })
      ] }, g);
    }),
    daily.map((d, i) => {
      const x = padL + i * bw;
      const baseY = padT + plotH;
      const segments = [
        [d.inputTokens / max * plotH, SEGMENT_COLORS.input],
        [d.cacheReadTokens / max * plotH, SEGMENT_COLORS.cacheRead],
        [d.cacheWriteTokens / max * plotH, SEGMENT_COLORS.cacheWrite],
        [d.outputTokens / max * plotH, SEGMENT_COLORS.output]
      ];
      let y = baseY;
      return /* @__PURE__ */ jsxs("g", { children: [
        segments.map(([h, color], s) => {
          y -= h;
          return /* @__PURE__ */ jsx("rect", { x, y, width: Math.max(1, bw - 2), height: Math.max(0, h), rx: 1, fill: color }, s);
        }),
        i % xLabelStep === 0 && /* @__PURE__ */ jsx("text", { x: x + bw / 2, y: H - 8, textAnchor: "middle", children: d.date.slice(5) })
      ] }, d.date);
    }),
    /* @__PURE__ */ jsx(
      "polyline",
      {
        points: daily.map((d, i) => {
          const x = padL + i * bw + bw / 2;
          const y = padT + plotH - d.cacheHitRate * plotH;
          return `${x},${y}`;
        }).join(" "),
        fill: "none",
        stroke: "var(--dsw-alias-label-primary)",
        strokeWidth: 1.4
      }
    ),
    daily.map((d, i) => /* @__PURE__ */ jsx(
      "circle",
      {
        cx: padL + i * bw + bw / 2,
        cy: padT + plotH - d.cacheHitRate * plotH,
        r: 1.8,
        fill: "var(--dsw-alias-label-primary)"
      },
      `dot${d.date}`
    )),
    daily.map((d, i) => {
      const x = padL + i * bw;
      return /* @__PURE__ */ jsxs("g", { children: [
        /* @__PURE__ */ jsx(
          "rect",
          {
            x,
            y: padT,
            width: bw,
            height: plotH,
            fill: "transparent",
            style: { cursor: "crosshair" },
            onMouseEnter: (event) => {
              setHover(i);
              showTip(d, event.clientX + 14, event.clientY + 14);
            },
            onMouseMove: (event) => showTip(d, event.clientX + 14, event.clientY + 14),
            onMouseLeave: () => {
              setHover(null);
              onTip(null);
            }
          }
        ),
        hover === i && /* @__PURE__ */ jsx(
          "rect",
          {
            x: x + 0.5,
            y: padT + 0.5,
            width: bw - 1,
            height: plotH - 1,
            fill: "none",
            stroke: "var(--dsw-alias-label-primary)",
            strokeWidth: 1,
            strokeDasharray: "3 2"
          }
        )
      ] }, `hit${d.date}`);
    })
  ] });
}
var API_BASE = "/_dsh/usage-heatmap/api";
function UsageSection() {
  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState("tokens");
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [heat, setHeat] = useState(null);
  const [tip, setTip] = useState(null);
  const tipRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const [nextSummary, nextHeat] = await Promise.all([
        fetchJson(`${API_BASE}/summary?days=${range}`),
        fetchJson(`${API_BASE}/heatmap?weeks=26`)
      ]);
      setSummary(nextSummary);
      setHeat(nextHeat);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [range]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      void load();
    }, 3e4);
    return () => {
      clearInterval(timer);
    };
  }, [auto, load]);
  useEffect(() => {
    const node = tipRef.current;
    if (node === null || tip === null) return;
    const rect = node.getBoundingClientRect();
    let { x, y } = tip;
    if (x + rect.width > window.innerWidth - 8) x = x - rect.width - 28;
    if (y + rect.height > window.innerHeight - 8) y = y - rect.height - 14;
    node.style.left = `${Math.max(8, x)}px`;
    node.style.top = `${Math.max(8, y)}px`;
  }, [tip]);
  return /* @__PURE__ */ jsxs("section", { className: "dsh_uh_section", "aria-labelledby": "dsh-usage-heatmap-title", children: [
    /* @__PURE__ */ jsxs("div", { className: "dsh_uh_header", children: [
      /* @__PURE__ */ jsx("h2", { id: "dsh-usage-heatmap-title", className: "dsh_uh_title", children: "\u7528\u91CF\u7EDF\u8BA1" }),
      /* @__PURE__ */ jsx("div", { className: "dsh_uh_tabs", role: "tablist", "aria-label": "\u7EDF\u8BA1\u533A\u95F4", children: [7, 30, 90, 365].map((days) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": range === days,
          className: "dsh_uh_tab",
          onClick: () => {
            setRange(days);
          },
          children: [
            days,
            "\u5929"
          ]
        },
        days
      )) }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: "dsh_uh_secondaryButton",
          onClick: () => {
            setMetric(metric === "tokens" ? "requests" : "tokens");
          },
          title: "\u5207\u6362\u70ED\u529B\u56FE\u7740\u8272\u4F9D\u636E",
          children: [
            "\u70ED\u529B\u4F9D\u636E\uFF1A",
            metric === "tokens" ? "Tokens" : "\u8BF7\u6C42\u6570"
          ]
        }
      ),
      /* @__PURE__ */ jsx("button", { type: "button", className: "dsh_uh_secondaryButton", onClick: () => {
        void load();
      }, children: "\u5237\u65B0" }),
      /* @__PURE__ */ jsxs("label", { className: "dsh_uh_autoToggle", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: auto, onChange: (event) => {
          setAuto(event.target.checked);
        } }),
        "\u81EA\u52A8\u5237\u65B0"
      ] }),
      /* @__PURE__ */ jsx("a", { className: "dsh_uh_link", href: "/_dsh/usage-heatmap/", target: "_blank", rel: "noreferrer", children: "\u5728\u72EC\u7ACB\u6807\u7B7E\u9875\u6253\u5F00 \u2197" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "dsh_uh_banner", style: { display: error === "" ? "none" : "block" }, children: [
      "\u52A0\u8F7D\u5931\u8D25\uFF1A",
      error,
      "\uFF08\u63D2\u4EF6\u5BBF\u4E3B\u672A\u91CD\u542F\uFF1F\uFF09"
    ] }),
    summary === null && heat === null && error === "" ? /* @__PURE__ */ jsx("div", { className: "dsh_uh_empty", children: "\u52A0\u8F7D\u4E2D\u2026" }) : summary !== null && summary.totals.requests === 0 ? /* @__PURE__ */ jsx("div", { className: "dsh_uh_empty", children: "\u6682\u65E0\u7528\u91CF\u6570\u636E\u3002\u63D2\u4EF6\u542F\u52A8\u540E\u4F1A\u81EA\u52A8\u56DE\u586B\u5386\u53F2\u4F1A\u8BDD\u65E5\u5FD7\uFF1B\u91CD\u542F DSH \u540E\u7A0D\u7B49\u7247\u523B\u518D\u5237\u65B0\u3002" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      summary !== null && /* @__PURE__ */ jsx(Cards, { totals: summary.totals }),
      /* @__PURE__ */ jsxs("div", { className: "dsh_uh_panel", children: [
        /* @__PURE__ */ jsxs("div", { className: "dsh_uh_header", children: [
          /* @__PURE__ */ jsxs("h3", { className: "dsh_uh_panelTitle", children: [
            "\u6BCF\u65E5\u70ED\u529B\uFF08\u6700\u8FD1 26 \u5468",
            heat !== null ? ` \xB7 ${fmtDate(heat.since)} ~ ${fmtDate(heat.until)}` : "",
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dsh_uh_legend", children: [
            "\u5C11",
            [0, 1, 2, 3, 4].map((level) => /* @__PURE__ */ jsx("span", { className: "dsh_uh_legendCell", "data-level": level }, level)),
            "\u591A"
          ] })
        ] }),
        heat !== null && /* @__PURE__ */ jsx(HeatCalendar, { heat, metric, onTip: setTip })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dsh_uh_row2", children: [
        /* @__PURE__ */ jsxs("div", { className: "dsh_uh_panel", children: [
          /* @__PURE__ */ jsxs("h3", { className: "dsh_uh_panelTitle", children: [
            "\u6309\u6A21\u578B\u7528\u91CF\uFF08\u8FD1 ",
            range,
            " \u5929\uFF09"
          ] }),
          /* @__PURE__ */ jsx(ModelTable, { models: summary?.models ?? [] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "dsh_uh_panel", children: [
          /* @__PURE__ */ jsxs("h3", { className: "dsh_uh_panelTitle", children: [
            "\u6BCF\u65E5\u8D8B\u52BF\uFF08\u8FD1 ",
            range,
            " \u5929\uFF1A\u672A\u547D\u4E2D\u8F93\u5165 / \u7F13\u5B58\u8BFB / \u7F13\u5B58\u5199 / \u8F93\u51FA\uFF0C\u767D\u7EBF = \u547D\u4E2D\u7387\uFF09"
          ] }),
          /* @__PURE__ */ jsx(DailyChart, { daily: summary?.daily ?? [], onTip: setTip })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dsh_uh_footer", children: "\u6570\u636E\u6765\u81EA\u672C\u673A\u4F1A\u8BDD\u65E5\u5FD7\uFF08assistant/message.usage\uFF09\u3002\u4EC5\u7EDF\u8BA1\u9002\u914D\u5668\u4E0A\u62A5\u4E86 token \u8BB0\u8D26\u7684\u8BF7\u6C42\uFF1B \u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB /\uFF08\u672A\u547D\u4E2D\u8F93\u5165 + \u7F13\u5B58\u8BFB + \u7F13\u5B58\u5199\uFF09\u3002\u6210\u672C\u4E3A\u4F30\u7B97\u503C\uFF0C\u6309\u63D2\u4EF6\u914D\u7F6E\u7684\u5B9A\u4EF7\u8868\u8BA1\u7B97\u3002" })
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        ref: tipRef,
        className: "dsh_uh_tooltip",
        style: { display: tip === null ? "none" : "block" },
        children: tip !== null && tip.text.map((line) => /* @__PURE__ */ jsx("div", { className: line.length < 12 ? "dsh_uh_tooltipTitle" : void 0, children: line }, line))
      }
    )
  ] });
}

// test/render-smoke.entry.tsx
var html = renderToString(React.createElement(UsageSection));
if (!html.includes("\u7528\u91CF\u7EDF\u8BA1")) throw new Error("render missing section title");
if (!html.includes("\u52A0\u8F7D\u4E2D")) throw new Error("render missing initial state");
if (!/30(?:<!-- -->)?天/u.test(html)) throw new Error("render missing range tabs");
if (!html.includes("\u70ED\u529B\u4F9D\u636E")) throw new Error("render missing metric toggle");
if (!html.includes("\u81EA\u52A8\u5237\u65B0")) throw new Error("render missing auto-refresh toggle");
if (!html.includes("\u5728\u72EC\u7ACB\u6807\u7B7E\u9875\u6253\u5F00")) throw new Error("render missing standalone link");
if (!html.includes("dsh_uh_section")) throw new Error("render missing section class");
console.log(`RENDER SMOKE OK (${html.length} chars)`);
