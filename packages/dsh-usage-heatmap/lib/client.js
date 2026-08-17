window.__ModuleLoader__.load({ id: "dsh-usage-heatmap", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/styles.ts
var STYLE_ID = "dsh-usage-heatmap-style";
var cssText = `
.dsh_uh_section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dsh_uh_header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.dsh_uh_title {
  margin: 0 8px 0 0;
  color: var(--dsw-alias-label-primary);
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.dsh_uh_tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_uh_tab {
  min-width: 48px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_uh_tab:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_uh_tab[aria-selected='true'] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.dsh_uh_secondaryButton {
  flex: none;
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_uh_secondaryButton:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_uh_autoToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_uh_autoToggle input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
}
.dsh_uh_link {
  margin-left: auto;
  color: var(--dsw-alias-brand-text);
  font-size: 12px;
  text-decoration: none;
}
.dsh_uh_link:hover {
  text-decoration: underline;
}
.dsh_uh_banner {
  display: none;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  border-radius: 8px;
  background: var(--dsw-alias-state-error-secondary);
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_uh_cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  min-width: 0;
}
.dsh_uh_card {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_uh_cardLabel {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh_uh_cardValue {
  margin-top: 3px;
  color: var(--dsw-alias-label-primary);
  font-size: 17px;
  line-height: 24px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.dsh_uh_cardSub {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_uh_panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.dsh_uh_panelTitle {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.dsh_uh_legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh_uh_legendCell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh_uh_legendCell[data-level='1'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_legendCell[data-level='2'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_legendCell[data-level='3'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_legendCell[data-level='4'] {
  background: var(--dsw-alias-brand-primary);
}
.dsh_uh_calendar {
  position: relative;
  display: grid;
  gap: 3px;
  width: max-content;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}
.dsh_uh_calMonth {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.dsh_uh_calDow {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 13px;
  text-align: right;
  padding-right: 5px;
}
.dsh_uh_calCell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
  cursor: default;
}
.dsh_uh_calCell[data-level='1'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_calCell[data-level='2'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_calCell[data-level='3'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-bg-layer-2));
}
.dsh_uh_calCell[data-level='4'] {
  background: var(--dsw-alias-brand-primary);
}
.dsh_uh_tooltip {
  position: fixed;
  z-index: 2000;
  display: none;
  min-width: 160px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  /* Follow the shell theme: light theme -> light tooltip, dark theme -> dark tooltip. */
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 6px 24px var(--dsw-alias-bg-mask-2);
  pointer-events: none;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh_uh_tooltipTitle {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dsh_uh_row2 {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dsh_uh_tableWrap {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
}
.dsh_uh_table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.dsh_uh_table th,
.dsh_uh_table td {
  padding: 5px 7px;
  text-align: right;
  white-space: nowrap;
}
.dsh_uh_table th:first-child,
.dsh_uh_table td:first-child {
  padding-left: 12px;
}
.dsh_uh_table th:last-child,
.dsh_uh_table td:last-child {
  padding-right: 12px;
}
.dsh_uh_table th {
  color: var(--dsw-alias-label-tertiary);
  font-weight: 600;
  font-size: 11px;
  line-height: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dsh_uh_table th:first-child,
.dsh_uh_table td:first-child {
  text-align: left;
}
.dsh_uh_table td {
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_uh_table td.dsh_uh_muted {
  color: var(--dsw-alias-label-tertiary);
}
.dsh_uh_share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 92px;
}
.dsh_uh_shareBar {
  display: inline-block;
  height: 5px;
  border-radius: 3px;
  background: var(--dsw-alias-brand-primary);
}
.dsh_uh_chart {
  width: 100%;
  aspect-ratio: 680 / 240;
}
.dsh_uh_chart text {
  fill: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
.dsh_uh_empty {
  padding: 26px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.dsh_uh_footer {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 18px;
}
`;
function adoptStyles() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = cssText;
  document.head.appendChild(style);
}

// src/client/UsageSection.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_cards", children: items.map(([label, value, sub]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_cardLabel", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_cardValue", children: value }),
    sub !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_cardSub", title: sub, children: sub })
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "dsh_uh_calendar",
      style: {
        gridTemplateColumns: `26px repeat(${weeks}, 13px)`,
        gridTemplateRows: "16px repeat(7, 13px)"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { gridRow: 1, gridColumn: 1 } }),
        monthLabels.map((label, w) => label !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_calMonth", style: { gridRow: 1, gridColumn: `${w + 2} / span ${monthSpans[w]}` }, children: label }, `m${w}`)),
        dows.map((_dow, d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_calDow", style: { gridRow: d + 2, gridColumn: 1 }, children: dows[(firstDow + d) % 7] }, `d${d}`)),
        cells.map((cell, i) => {
          const week = Math.floor(i / 7);
          const dow = i % 7;
          const value = metric === "tokens" ? cell.totalTokens : cell.requests;
          const level = cellLevel(value, max);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_empty", children: "\u6682\u65E0\u6570\u636E" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_tableWrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "dsh_uh_table", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8BF7\u6C42" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8F93\u5165" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8F93\u51FA" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7F13\u5B58\u8BFB" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7F13\u5B58\u5199" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u547D\u4E2D\u7387" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u6210\u672C" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u5360\u6BD4" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { title: model.provider, children: model.model }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtInt(model.requests) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens(model.inputTokens) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens(model.outputTokens) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens(model.cacheReadTokens) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTokens(model.cacheWriteTokens) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtPct(model.cacheHitRate) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtCost(model.cost) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh_uh_share", children: [
        fmtPct(model.share),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_uh_shareBar", style: { width: `${Math.max(4, Math.round(model.share * 100))}px` } })
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
  const [hover, setHover] = (0, import_react.useState)(null);
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className: "dsh_uh_chart", viewBox: `0 0 ${W} ${H}`, children: [
    [0, 1, 2, 3].map((g) => {
      const gy = padT + plotH * g / 3;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: "var(--dsw-alias-border-l1)", strokeWidth: 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: padL - 6, y: gy + 3, textAnchor: "end", children: fmtTokens(max * (3 - g) / 3) })
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
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
        segments.map(([h, color], s) => {
          y -= h;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x, y, width: Math.max(1, bw - 2), height: Math.max(0, h), rx: 1, fill: color }, s);
        }),
        i % xLabelStep === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: x + bw / 2, y: H - 8, textAnchor: "middle", children: d.date.slice(5) })
      ] }, d.date);
    }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
    daily.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
        hover === i && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
  const [range, setRange] = (0, import_react.useState)(30);
  const [metric, setMetric] = (0, import_react.useState)("tokens");
  const [auto, setAuto] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)("");
  const [summary, setSummary] = (0, import_react.useState)(null);
  const [heat, setHeat] = (0, import_react.useState)(null);
  const [tip, setTip] = (0, import_react.useState)(null);
  const tipRef = (0, import_react.useRef)(null);
  const load = (0, import_react.useCallback)(async () => {
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
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  (0, import_react.useEffect)(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      void load();
    }, 3e4);
    return () => {
      clearInterval(timer);
    };
  }, [auto, load]);
  (0, import_react.useEffect)(() => {
    const node = tipRef.current;
    if (node === null || tip === null) return;
    const rect = node.getBoundingClientRect();
    let { x, y } = tip;
    if (x + rect.width > window.innerWidth - 8) x = x - rect.width - 28;
    if (y + rect.height > window.innerHeight - 8) y = y - rect.height - 14;
    node.style.left = `${Math.max(8, x)}px`;
    node.style.top = `${Math.max(8, y)}px`;
  }, [tip]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh_uh_section", "aria-labelledby": "dsh-usage-heatmap-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { id: "dsh-usage-heatmap-title", className: "dsh_uh_title", children: "\u7528\u91CF\u7EDF\u8BA1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_tabs", role: "tablist", "aria-label": "\u7EDF\u8BA1\u533A\u95F4", children: [7, 30, 90, 365].map((days) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh_uh_secondaryButton", onClick: () => {
        void load();
      }, children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsh_uh_autoToggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: auto, onChange: (event) => {
          setAuto(event.target.checked);
        } }),
        "\u81EA\u52A8\u5237\u65B0"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "dsh_uh_link", href: "/_dsh/usage-heatmap/", target: "_blank", rel: "noreferrer", children: "\u5728\u72EC\u7ACB\u6807\u7B7E\u9875\u6253\u5F00 \u2197" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_banner", style: { display: error === "" ? "none" : "block" }, children: [
      "\u52A0\u8F7D\u5931\u8D25\uFF1A",
      error,
      "\uFF08\u63D2\u4EF6\u5BBF\u4E3B\u672A\u91CD\u542F\uFF1F\uFF09"
    ] }),
    summary === null && heat === null && error === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_empty", children: "\u52A0\u8F7D\u4E2D\u2026" }) : summary !== null && summary.totals.requests === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_empty", children: "\u6682\u65E0\u7528\u91CF\u6570\u636E\u3002\u63D2\u4EF6\u542F\u52A8\u540E\u4F1A\u81EA\u52A8\u56DE\u586B\u5386\u53F2\u4F1A\u8BDD\u65E5\u5FD7\uFF1B\u91CD\u542F DSH \u540E\u7A0D\u7B49\u7247\u523B\u518D\u5237\u65B0\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      summary !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, { totals: summary.totals }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "dsh_uh_panelTitle", children: [
            "\u6BCF\u65E5\u70ED\u529B\uFF08\u6700\u8FD1 26 \u5468",
            heat !== null ? ` \xB7 ${fmtDate(heat.since)} ~ ${fmtDate(heat.until)}` : "",
            "\uFF09"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_legend", children: [
            "\u5C11",
            [0, 1, 2, 3, 4].map((level) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh_uh_legendCell", "data-level": level }, level)),
            "\u591A"
          ] })
        ] }),
        heat !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeatCalendar, { heat, metric, onTip: setTip })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_row2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_panel", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "dsh_uh_panelTitle", children: [
            "\u6309\u6A21\u578B\u7528\u91CF\uFF08\u8FD1 ",
            range,
            " \u5929\uFF09"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelTable, { models: summary?.models ?? [] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh_uh_panel", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "dsh_uh_panelTitle", children: [
            "\u6BCF\u65E5\u8D8B\u52BF\uFF08\u8FD1 ",
            range,
            " \u5929\uFF1A\u672A\u547D\u4E2D\u8F93\u5165 / \u7F13\u5B58\u8BFB / \u7F13\u5B58\u5199 / \u8F93\u51FA\uFF0C\u767D\u7EBF = \u547D\u4E2D\u7387\uFF09"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DailyChart, { daily: summary?.daily ?? [], onTip: setTip })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh_uh_footer", children: "\u6570\u636E\u6765\u81EA\u672C\u673A\u4F1A\u8BDD\u65E5\u5FD7\uFF08assistant/message.usage\uFF09\u3002\u4EC5\u7EDF\u8BA1\u9002\u914D\u5668\u4E0A\u62A5\u4E86 token \u8BB0\u8D26\u7684\u8BF7\u6C42\uFF1B \u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB /\uFF08\u672A\u547D\u4E2D\u8F93\u5165 + \u7F13\u5B58\u8BFB + \u7F13\u5B58\u5199\uFF09\u3002\u6210\u672C\u4E3A\u4F30\u7B97\u503C\uFF0C\u6309\u63D2\u4EF6\u914D\u7F6E\u7684\u5B9A\u4EF7\u8868\u8BA1\u7B97\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        ref: tipRef,
        className: "dsh_uh_tooltip",
        style: { display: tip === null ? "none" : "block" },
        children: tip !== null && tip.text.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: line.length < 12 ? "dsh_uh_tooltipTitle" : void 0, children: line }, line))
      }
    )
  ] });
}

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  adoptStyles();
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "usage-heatmap",
        order: 200,
        label: "\u7528\u91CF\u7EDF\u8BA1"
      },
      UsageSection
    )
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map
