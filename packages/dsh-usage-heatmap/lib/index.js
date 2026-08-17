// src/index.ts
import { join as join2 } from "node:path";
import z from "@deepseek-ai/schemastery";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

// src/fold.ts
function foldEvents(store, sessionId, events) {
  if (events.length === 0) return 0;
  const fromSeq = store.watermark(sessionId);
  const rows = [];
  let provider = "";
  let model = "";
  for (const event of events) {
    if (event.seq <= fromSeq) continue;
    if (event.type === "request/header") {
      provider = event.data.header.config.provider;
      model = event.data.header.config.model;
    } else if (event.type === "assistant/message" && event.data.usage !== void 0) {
      const source = event.data.message.source;
      const usage = event.data.usage;
      rows.push({
        seq: event.seq,
        time: event.time,
        sessionId,
        turn: event.data.turn,
        step: event.data.step,
        provider: source.kind === "model" && source.provider !== "" ? source.provider : provider,
        model: source.kind === "model" && source.model !== "" ? source.model : model,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0
      });
    }
  }
  const lastSeq = events[events.length - 1].seq;
  store.advanceWatermark(sessionId, lastSeq);
  return store.addRows(rows);
}
function foldLiveEvent(store, session, event) {
  foldEvents(store, String(session.id), [event]);
}

// src/backfill.ts
async function runBackfill(ctx, store, log) {
  const persistence = ctx.sessionPersistence;
  if (persistence === void 0) return 0;
  let added = 0;
  let inspected = 0;
  try {
    const headers = await persistence.list();
    for (const header of headers) {
      const id = String(header.id);
      try {
        const { events } = await persistence.inspect(header.id);
        inspected += 1;
        const from = store.watermark(id);
        const lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
        if (lastSeq <= from) continue;
        added += foldEvents(store, id, events);
      } catch (error) {
        log(`usage backfill: session ${id} skipped: ${error.message}`);
      }
    }
  } catch (error) {
    log(`usage backfill: listing failed: ${error.message}`);
  }
  log(`usage backfill: inspected ${inspected} session(s), added ${added} row(s)`);
  return added;
}

// src/aggregate.ts
function localDateKey(time) {
  const d = new Date(time);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
function startOfLocalDay(time) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function priceFor(prices, provider, model) {
  return prices.find((entry) => entry.provider === provider && entry.model === model);
}
function costOf(row, price) {
  if (price === void 0) return 0;
  return (row.inputTokens + row.cacheWriteTokens) / 1e6 * price.input + row.cacheReadTokens / 1e6 * price.cacheRead + row.outputTokens / 1e6 * price.output;
}
function emptyAgg(date) {
  return {
    date,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    billedInputTokens: 0,
    cacheHitRate: 0,
    cost: 0
  };
}
function addToAgg(target, row, price) {
  target.requests += 1;
  target.inputTokens += row.inputTokens;
  target.outputTokens += row.outputTokens;
  target.cacheReadTokens += row.cacheReadTokens;
  target.cacheWriteTokens += row.cacheWriteTokens;
  target.reasoningTokens += row.reasoningTokens;
  target.billedInputTokens += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
  target.cost += costOf(row, price);
}
function finalize(agg) {
  agg.cacheHitRate = agg.billedInputTokens > 0 ? agg.cacheReadTokens / agg.billedInputTokens : 0;
}
function summarize(rows, days, prices) {
  const until = startOfLocalDay(Date.now()) + 864e5 - 1;
  const since = startOfLocalDay(Date.now()) - (days - 1) * 864e5;
  const totals = emptyAgg("");
  const byDay = /* @__PURE__ */ new Map();
  const byModel = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.time < since || row.time > until) continue;
    const price = priceFor(prices, row.provider, row.model);
    addToAgg(totals, row, price);
    const dayKey = localDateKey(row.time);
    let day = byDay.get(dayKey);
    if (day === void 0) {
      day = emptyAgg(dayKey);
      byDay.set(dayKey, day);
    }
    addToAgg(day, row, price);
    const modelKey = `${row.provider}/${row.model}`;
    let model = byModel.get(modelKey);
    if (model === void 0) {
      model = { ...emptyAgg(""), provider: row.provider, model: row.model, share: 0, modelTokens: 0 };
      byModel.set(modelKey, model);
    }
    model.modelTokens += row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
    addToAgg(model, row, price);
  }
  finalize(totals);
  const daily = [];
  for (let offset = 0; offset < days; offset += 1) {
    const key = localDateKey(since + offset * 864e5);
    const day = byDay.get(key);
    if (day !== void 0) finalize(day);
    daily.push(day ?? emptyAgg(key));
  }
  const models = [...byModel.values()].map((model) => {
    finalize(model);
    return { ...model, share: totals.billedInputTokens > 0 ? model.billedInputTokens / totals.billedInputTokens : 0 };
  }).sort((a, b) => b.billedInputTokens - a.billedInputTokens);
  return { since, until, totals, models, daily };
}
function heatmap(rows, weeks, since, until) {
  const cells = /* @__PURE__ */ new Map();
  const empty = (key) => ({ date: key, requests: 0, totalTokens: 0, cacheHitRate: 0, billedInput: 0 });
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const key = localDateKey(since + offset * 864e5);
    cells.set(key, empty(key));
  }
  for (const row of rows) {
    if (row.time < since || row.time > until) continue;
    const cell = cells.get(localDateKey(row.time));
    if (cell === void 0) continue;
    cell.requests += 1;
    cell.totalTokens += row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
    cell.cacheHitRate += row.cacheReadTokens;
    cell.billedInput += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
  }
  return [...cells.values()].map(({ billedInput, ...cell }) => ({
    ...cell,
    cacheHitRate: billedInput > 0 ? cell.cacheHitRate / billedInput : 0
  }));
}
function rawRows(rows, since, until, provider, model) {
  return rows.filter((row) => row.time >= since && row.time <= until && (provider === void 0 || row.provider === provider) && (model === void 0 || row.model === model));
}

// src/page.ts
var PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH \u7528\u91CF\u70ED\u529B\u56FE</title>
<style>
:root {
  --bg: #0d0f14; --panel: #14161d; --panel2: #181b23; --border: #23262f;
  --border2: #3a3f4d; --text: #e6e8ee; --muted: #8b90a0; --accent: #4c8dff;
  --green: #3fb68b; --amber: #e8b339; --violet: #8b5cf6; --red: #e25c5c;
  --on-accent: #ffffff;
  --banner-bg: #3a1520; --banner-border: #5c2333; --banner-text: #ffb3b3;
  --tip-bg: #1c1f28; --tip-border: #333848;
  --l0: #1a1d26; --l1: #12313f; --l2: #10474f; --l3: #0e6358; --l4: #2b9e7a;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f5f6f8; --panel: #ffffff; --panel2: #f0f1f4; --border: #e3e5ea;
    --border2: #d4d7de; --text: #1c1f26; --muted: #6b7280; --accent: #2f6fe4;
    --green: #189a68; --amber: #c07f16; --violet: #6d56d6; --red: #d23d3d;
    --on-accent: #ffffff;
    --banner-bg: #fdecec; --banner-border: #f2c4c4; --banner-text: #b3261e;
    --tip-bg: #ffffff; --tip-border: #e3e5ea;
    --l0: #eceef2; --l1: #cfe0f8; --l2: #9dc4f5; --l3: #5f9cf0; --l4: #2f6fe4;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
body { padding: 20px 24px 28px; }
header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
h1 { font-size: 17px; margin: 0 8px 0 0; font-weight: 650; }
h2 { font-size: 13px; margin: 0 0 10px; color: var(--muted); font-weight: 600;
  letter-spacing: .02em; text-transform: none; }
button { background: var(--panel2); color: var(--text); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
button:hover { border-color: var(--border2); }
button.active { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.muted { color: var(--muted); }
#banner { display: none; background: var(--banner-bg); border: 1px solid var(--banner-border); color: var(--banner-text);
  border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.card .label { color: var(--muted); font-size: 11px; margin-bottom: 4px; }
.card .value { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
.card .sub { color: var(--muted); font-size: 11px; margin-top: 2px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
.row2 { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 1000px) { .row2 { grid-template-columns: 1fr; } }
/* calendar */
.cal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.legend { display: flex; align-items: center; gap: 5px; margin-left: auto; color: var(--muted); font-size: 11px; }
.legend .cell { width: 11px; height: 11px; border-radius: 3px; }
#cal-wrap { overflow-x: auto; padding-bottom: 4px; }
#cal { display: grid; grid-template-rows: 16px repeat(7, 13px); gap: 3px; width: max-content; }
#cal .wlabel { font-size: 10px; color: var(--muted); height: 12px; line-height: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
#cal .cell { width: 13px; height: 13px; border-radius: 3px; background: var(--l0); cursor: default; }
#cal .cell[data-level="1"] { background: var(--l1); }
#cal .cell[data-level="2"] { background: var(--l2); }
#cal .cell[data-level="3"] { background: var(--l3); }
#cal .cell[data-level="4"] { background: var(--l4); }
#cal .dow { font-size: 10px; color: var(--muted); height: 13px; line-height: 13px; text-align: right; padding-right: 4px; }
/* table */
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 5px 8px; white-space: nowrap; }
th { color: var(--muted); font-weight: 600; font-size: 11px; border-bottom: 1px solid var(--border); }
th:first-child, td:first-child { text-align: left; }
td.num { color: var(--text); }
td.muted { color: var(--muted); }
.bar { display: inline-block; height: 5px; border-radius: 3px; background: var(--accent); vertical-align: middle; margin-left: 6px; }
/* chart */
svg text { fill: var(--muted); font-size: 10px; }
#tooltip { position: fixed; z-index: 100; display: none; background: var(--tip-bg); border: 1px solid var(--tip-border);
  border-radius: 8px; padding: 8px 10px; font-size: 12px; pointer-events: none; box-shadow: 0 6px 24px rgba(0,0,0,.45); }
#tooltip .t { font-weight: 600; margin-bottom: 3px; }
footer { color: var(--muted); font-size: 11px; margin-top: 4px; line-height: 1.7; }
</style>
</head>
<body>
<header>
  <h1>DSH \u7528\u91CF\u70ED\u529B\u56FE</h1>
  <span id="range" class="controls"></span>
  <span class="controls"><button id="metric" title="\u5207\u6362\u70ED\u529B\u56FE\u989C\u8272\u4F9D\u636E"></button></span>
  <button id="refresh">\u5237\u65B0</button>
  <label class="muted"><input type="checkbox" id="auto" checked> \u81EA\u52A8\u5237\u65B0</label>
  <a id="open-standalone" href="/_dsh/usage-heatmap/" target="_blank" rel="noreferrer"
     style="display:none; margin-left:auto; color:var(--muted); text-decoration:none; font-size:12px;">\u5728\u72EC\u7ACB\u6807\u7B7E\u9875\u6253\u5F00 \u2197</a>
</header>
<div id="banner"></div>
<section class="cards" id="cards"></section>
<section class="panel">
  <div class="cal-head">
    <h2>\u6BCF\u65E5\u70ED\u529B\uFF08\u6700\u8FD1 26 \u5468\uFF09</h2>
    <div class="legend">\u5C11 <span class="cell" data-level="0"></span><span class="cell" data-level="1"></span><span class="cell" data-level="2"></span><span class="cell" data-level="3"></span><span class="cell" data-level="4"></span> \u591A</div>
  </div>
  <div id="cal-wrap"><div id="cal"></div></div>
</section>
<div class="row2">
  <section class="panel">
    <h2>\u6309\u6A21\u578B\u7528\u91CF</h2>
    <table id="model-table"><thead><tr>
      <th>\u6A21\u578B</th><th>\u8BF7\u6C42</th><th>\u8F93\u5165</th><th>\u8F93\u51FA</th><th>\u7F13\u5B58\u8BFB</th><th>\u7F13\u5B58\u5199</th><th>\u547D\u4E2D\u7387</th><th>\u6210\u672C</th><th>\u5360\u6BD4</th>
    </tr></thead><tbody></tbody></table>
  </section>
  <section class="panel">
    <h2 id="trend-title">\u6BCF\u65E5\u8D8B\u52BF</h2>
    <svg id="chart" viewBox="0 0 680 240" width="100%"></svg>
  </section>
</div>
<footer>
  \u6570\u636E\u6765\u6E90\uFF1A\u672C\u673A\u4F1A\u8BDD\u65E5\u5FD7\uFF08assistant/message.usage\uFF0C\u7531 dsh-session \u6301\u4E45\u5316\uFF09\u3002\u4EC5\u7EDF\u8BA1\u9002\u914D\u5668\u4E0A\u62A5\u4E86 token \u8BB0\u8D26\u7684\u8BF7\u6C42\uFF1B
  \u5931\u8D25\u7684\u8BF7\u6C42\u4E0E\u672A\u4E0A\u62A5 usage \u7684\u5386\u53F2\u65E5\u5FD7\u4E0D\u8BA1\u5165\u3002\u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB /\uFF08\u672A\u547D\u4E2D\u8F93\u5165 + \u7F13\u5B58\u8BFB + \u7F13\u5B58\u5199\uFF09\u3002
  \u6210\u672C\u4E3A\u4F30\u7B97\u503C\uFF0C\u6309\u63D2\u4EF6\u914D\u7F6E\u7684\u5B9A\u4EF7\u8868\uFF08\u9ED8\u8BA4 DeepSeek \u5B98\u65B9\u4EF7\u76EE\uFF09\u8BA1\u7B97\uFF1B\u672A\u5339\u914D\u7684\u6A21\u578B\u4E0D\u8BA1\u6210\u672C\u3002
</footer>
<div id="tooltip"></div>
<script>
(function () {
  'use strict';
  var API = '/_dsh/usage-heatmap/api';
  var state = { range: 30, metric: 'tokens', auto: true, timer: null, summary: null, heat: null };

  function fmtTokens(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }
  function fmtInt(n) { return n >= 1e6 ? fmtTokens(n) : String(n); }
  function fmtCost(n) { return n <= 0 ? '\u2014' : '$' + (n < 0.01 ? n.toFixed(4) : n.toFixed(2)); }
  function fmtPct(r) { return (r * 100).toFixed(1) + '%'; }
  function fmtDate(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function banner(message) {
    var b = document.getElementById('banner');
    if (message) { b.textContent = message; b.style.display = 'block'; }
    else b.style.display = 'none';
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok || body.ok !== true) throw new Error((body.error && body.error.message) || ('HTTP ' + r.status));
        return body.value;
      });
    });
  }

  function renderRangeButtons() {
    var wrap = document.getElementById('range');
    wrap.textContent = '';
    [7, 30, 90, 365].forEach(function (days) {
      var b = el('button', days === state.range ? 'active' : '', days + '\u5929');
      b.addEventListener('click', function () {
        state.range = days;
        renderRangeButtons();
        void load();
      });
      wrap.appendChild(b);
    });
  }

  function renderCards(t) {
    var cards = document.getElementById('cards');
    cards.textContent = '';
    var items = [
      ['\u8BF7\u6C42\u6570', fmtInt(t.requests), ''],
      ['\u8F93\u5165 tokens\uFF08\u672A\u547D\u4E2D\u7F13\u5B58\uFF09', fmtTokens(t.inputTokens), ''],
      ['\u8F93\u51FA tokens', fmtTokens(t.outputTokens), ''],
      ['\u7F13\u5B58\u547D\u4E2D\u7387', fmtPct(t.cacheHitRate), t.cacheReadTokens + ' \u8BFB / ' + (t.inputTokens + t.cacheWriteTokens) + ' \u672A\u547D\u4E2D'],
      ['\u7F13\u5B58\u8BFB tokens', fmtTokens(t.cacheReadTokens), ''],
      ['\u7F13\u5B58\u5199 tokens', fmtTokens(t.cacheWriteTokens), ''],
      ['\u63A8\u7406 tokens', fmtTokens(t.reasoningTokens), ''],
      ['\u4F30\u7B97\u6210\u672C', fmtCost(t.cost), t.cost > 0 ? '\u6309\u914D\u7F6E\u5B9A\u4EF7\u8868' : '\u672A\u914D\u7F6E\u5B9A\u4EF7'],
    ];
    items.forEach(function (item) {
      var card = el('div', 'card');
      card.appendChild(el('div', 'label', item[0]));
      card.appendChild(el('div', 'value', item[1]));
      if (item[2]) card.appendChild(el('div', 'sub', item[2]));
      cards.appendChild(card);
    });
  }

  function cellLevel(heat, cell) {
    var v = state.metric === 'tokens' ? cell.totalTokens : cell.requests;
    if (v <= 0) return 0;
    var max = 0;
    heat.cells.forEach(function (c) {
      var cv = state.metric === 'tokens' ? c.totalTokens : c.requests;
      if (cv > max) max = cv;
    });
    if (max <= 0) return 0;
    var ratio = v / max;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  }

  function renderCalendar(heat) {
    var cal = document.getElementById('cal');
    cal.textContent = '';
    // Compact month labels drop the year; show the exact range in the title.
    var h2 = document.querySelector('.cal-head h2');
    if (h2) h2.textContent = '\u6BCF\u65E5\u70ED\u529B\uFF08\u6700\u8FD1 26 \u5468 \xB7 ' + fmtDate(heat.since) + ' ~ ' + fmtDate(heat.until) + '\uFF09';
    var cells = heat.cells;
    var weeks = heat.weeks;
    // Weekday of the window's first cell; every row is derived from it, so
    // the weekday labels and the data rows always match.
    var firstDow = new Date(cells[0].date + 'T00:00:00').getDay();
    // The week column count is dynamic, so the column template is set here.
    cal.style.gridTemplateColumns = '26px repeat(' + weeks + ', 13px)';
    // Corner spacer.
    var spacer = document.createElement('div');
    spacer.style.gridRow = '1';
    spacer.style.gridColumn = '1';
    cal.appendChild(spacer);
    // Month labels on row 1: the week containing the 1st-7th of each month,
    // each spanning all columns up to the next label so adjacent labels can
    // never collide. Labels are compact ("2\u6708", "3\u6708", \u2026) \u2014 two characters
    // fit even the tightest case (a month-start only two columns after the
    // previous label), regardless of font.
    var labelWeeks = [];
    for (var w = 0; w < weeks; w++) {
      var wkStart = new Date(cells[w * 7].date + 'T00:00:00');
      if (w === 0 || wkStart.getDate() <= 7) labelWeeks.push(w);
    }
    for (var li = 0; li < labelWeeks.length; li++) {
      var lw = labelWeeks[li];
      var lStart = new Date(cells[lw * 7].date + 'T00:00:00');
      var label = (lStart.getMonth() + 1) + '\u6708';
      var end = li + 1 < labelWeeks.length ? labelWeeks[li + 1] : weeks;
      var wd = el('div', 'wlabel', label);
      wd.style.gridRow = '1';
      wd.style.gridColumn = (lw + 2) + ' / span ' + Math.max(1, end - lw);
      cal.appendChild(wd);
    }
    // Day-of-week labels in column 1 (all seven, aligned to the window start).
    var dows = ['\u65E5', '\u4E00', '\u4E8C', '\u4E09', '\u56DB', '\u4E94', '\u516D'];
    for (var d = 0; d < 7; d++) {
      var dd = el('div', 'dow', dows[(firstDow + d) % 7]);
      dd.style.gridRow = String(d + 2);
      dd.style.gridColumn = '1';
      cal.appendChild(dd);
    }
    // Cell grid: column = week, row = weekday (both explicit).
    for (var w2 = 0; w2 < weeks; w2++) {
      for (var d2 = 0; d2 < 7; d2++) {
        var idx = w2 * 7 + d2;
        var cell = cells[idx];
        var div = el('div', 'cell');
        div.setAttribute('data-level', String(cellLevel(heat, cell)));
        div.style.gridRow = String(d2 + 2);
        div.style.gridColumn = String(w2 + 2);
        if (cell.requests > 0) {
          div.addEventListener('mouseenter', function (c) { return function () { showTip(c, div); }; }(cell));
          div.addEventListener('mousemove', moveTip);
          div.addEventListener('mouseleave', hideTip);
        }
        cal.appendChild(div);
      }
    }
  }

  var tip = document.getElementById('tooltip');
  function showTip(cell, anchor) {
    tip.textContent = '';
    tip.appendChild(el('div', 't', cell.date));
    tip.appendChild(el('div', '', '\u8BF7\u6C42 ' + cell.requests + ' \xB7 \u603B tokens ' + fmtTokens(cell.totalTokens)));
    tip.appendChild(el('div', '', '\u7F13\u5B58\u547D\u4E2D\u7387 ' + fmtPct(cell.cacheHitRate)));
    var r = anchor.getBoundingClientRect();
    tip.style.display = 'block';
    moveTip({ clientX: r.left + r.width / 2, clientY: r.top });
  }
  function moveTip(e) {
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  // Daily trend chart tooltip: one day's full breakdown.
  var chartHighlight = null;
  function chartTip(d, e) {
    tip.textContent = '';
    tip.appendChild(el('div', 't', d.date));
    tip.appendChild(el('div', '', '\u8BF7\u6C42 ' + fmtInt(d.requests) + ' \xB7 \u547D\u4E2D\u7387 ' + fmtPct(d.cacheHitRate)));
    tip.appendChild(el('div', '', '\u672A\u547D\u4E2D\u8F93\u5165 ' + fmtTokens(d.inputTokens) + ' \xB7 \u7F13\u5B58\u8BFB ' + fmtTokens(d.cacheReadTokens)));
    tip.appendChild(el('div', '', '\u7F13\u5B58\u5199 ' + fmtTokens(d.cacheWriteTokens) + ' \xB7 \u8F93\u51FA ' + fmtTokens(d.outputTokens)));
    tip.appendChild(el('div', '', '\u6210\u672C ' + fmtCost(d.cost)));
    tip.style.display = 'block';
    moveTip(e);
  }

  function renderModels(t) {
    var tbody = document.querySelector('#model-table tbody');
    tbody.textContent = '';
    if (t.models.length === 0) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', 'muted', '\u6682\u65E0\u6570\u636E'));
      tbody.appendChild(tr);
      return;
    }
    t.models.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', '', m.model + (m.provider ? ' \xB7 ' + m.provider : '')));
      tr.appendChild(el('td', 'num', fmtInt(m.requests)));
      tr.appendChild(el('td', 'num', fmtTokens(m.inputTokens)));
      tr.appendChild(el('td', 'num', fmtTokens(m.outputTokens)));
      tr.appendChild(el('td', 'num', fmtTokens(m.cacheReadTokens)));
      tr.appendChild(el('td', 'num', fmtTokens(m.cacheWriteTokens)));
      tr.appendChild(el('td', 'num', fmtPct(m.cacheHitRate)));
      tr.appendChild(el('td', 'num', fmtCost(m.cost)));
      var shareTd = document.createElement('td');
      shareTd.appendChild(el('span', '', fmtPct(m.share)));
      var bar = el('span', 'bar');
      bar.style.width = Math.max(4, Math.round(m.share * 120)) + 'px';
      shareTd.appendChild(bar);
      tr.appendChild(shareTd);
      tbody.appendChild(tr);
    });
  }

  function renderChart(t) {
    var svg = document.getElementById('chart');
    var title = document.getElementById('trend-title');
    title.textContent = '\u6BCF\u65E5\u8D8B\u52BF\uFF08\u8FD1 ' + state.range + ' \u5929\uFF1A\u672A\u547D\u4E2D\u8F93\u5165 / \u7F13\u5B58\u8BFB / \u7F13\u5B58\u5199 / \u8F93\u51FA\uFF0C\u767D\u7EBF = \u547D\u4E2D\u7387\uFF09';
    svg.textContent = '';
    // Resolve theme tokens once (SVG attributes cannot carry var()).
    var cs = getComputedStyle(document.documentElement);
    var C = {
      grid: cs.getPropertyValue('--border').trim() || '#23262f',
      input: cs.getPropertyValue('--accent').trim() || '#4c8dff',
      cacheRead: cs.getPropertyValue('--green').trim() || '#3fb68b',
      cacheWrite: cs.getPropertyValue('--violet').trim() || '#8b5cf6',
      output: cs.getPropertyValue('--amber').trim() || '#e8b339',
      line: cs.getPropertyValue('--text').trim() || '#e6e8ee',
    };
    var W = 680, H = 240, padL = 56, padR = 12, padT = 14, padB = 26;
    var days = t.daily;
    var maxTokens = 0;
    days.forEach(function (d) {
      var v = d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens + d.outputTokens;
      if (v > maxTokens) maxTokens = v;
    });
    if (maxTokens <= 0) maxTokens = 1;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var bw = plotW / days.length;
    var ns = 'http://www.w3.org/2000/svg';
    function seg(x, y, h, color) {
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.max(1, bw - 2));
      r.setAttribute('height', Math.max(0, h)); r.setAttribute('fill', color); r.setAttribute('rx', '1');
      return r;
    }
    // gridlines + y labels
    for (var g = 0; g <= 3; g++) {
      var gy = padT + plotH * g / 3;
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', padL); line.setAttribute('y1', gy);
      line.setAttribute('x2', W - padR); line.setAttribute('y2', gy);
      line.setAttribute('stroke', C.grid); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      var txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', padL - 6); txt.setAttribute('y', gy + 3); txt.setAttribute('text-anchor', 'end');
      txt.textContent = fmtTokens(maxTokens * (3 - g) / 3);
      svg.appendChild(txt);
    }
    // x labels: every ceil(days/8)-th day
    var step = Math.max(1, Math.ceil(days.length / 8));
    days.forEach(function (d, i) {
      var x = padL + i * bw;
      var baseY = padT + plotH;
      var hIn = d.inputTokens / maxTokens * plotH;
      var hCr = d.cacheReadTokens / maxTokens * plotH;
      var hCw = d.cacheWriteTokens / maxTokens * plotH;
      var hOut = d.outputTokens / maxTokens * plotH;
      var y = baseY;
      y -= hIn; svg.appendChild(seg(x, y, hIn, C.input));
      y -= hCr; svg.appendChild(seg(x, y, hCr, C.cacheRead));
      y -= hCw; svg.appendChild(seg(x, y, hCw, C.cacheWrite));
      y -= hOut; svg.appendChild(seg(x, y, hOut, C.output));
      if (i % step === 0) {
        var xt = document.createElementNS(ns, 'text');
        xt.setAttribute('x', x + bw / 2); xt.setAttribute('y', H - 8); xt.setAttribute('text-anchor', 'middle');
        xt.textContent = d.date.slice(5);
        svg.appendChild(xt);
      }
    });
    // cache hit rate polyline
    var pts = [];
    days.forEach(function (d, i) {
      var x = padL + i * bw + bw / 2;
      var y = padT + plotH - d.cacheHitRate * plotH;
      pts.push(x + ',' + y);
      var dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', '1.8');
      dot.setAttribute('fill', C.line);
      svg.appendChild(dot);
    });
    if (pts.length > 0) {
      var poly = document.createElementNS(ns, 'polyline');
      poly.setAttribute('points', pts.join(' '));
      poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', C.line); poly.setAttribute('stroke-width', '1.4');
      svg.appendChild(poly);
    }
    // Hover layer: one full-height hit area per day (on top of everything),
    // showing the day's breakdown and a dashed outline while hovered.
    days.forEach(function (d, i) {
      var x = padL + i * bw;
      var hit = document.createElementNS(ns, 'rect');
      hit.setAttribute('x', x); hit.setAttribute('y', padT);
      hit.setAttribute('width', bw); hit.setAttribute('height', plotH);
      hit.setAttribute('fill', 'transparent');
      hit.style.cursor = 'crosshair';
      hit.addEventListener('mouseenter', function (e) {
        if (chartHighlight) chartHighlight.remove();
        chartHighlight = document.createElementNS(ns, 'rect');
        chartHighlight.setAttribute('x', x + 0.5); chartHighlight.setAttribute('y', padT + 0.5);
        chartHighlight.setAttribute('width', bw - 1); chartHighlight.setAttribute('height', plotH - 1);
        chartHighlight.setAttribute('fill', 'none'); chartHighlight.setAttribute('stroke', C.line);
        chartHighlight.setAttribute('stroke-width', '1'); chartHighlight.setAttribute('stroke-dasharray', '3 2');
        svg.appendChild(chartHighlight);
        chartTip(d, e);
      });
      hit.addEventListener('mousemove', function (e) { chartTip(d, e); });
      hit.addEventListener('mouseleave', function () {
        if (chartHighlight) { chartHighlight.remove(); chartHighlight = null; }
        hideTip();
      });
      svg.appendChild(hit);
    });
  }

  function load() {
    return Promise.all([
      fetchJson(API + '/summary?days=' + state.range),
      fetchJson(API + '/heatmap?weeks=26'),
    ]).then(function (results) {
      state.summary = results[0];
      state.heat = results[1];
      banner('');
      renderCards(state.summary.totals);
      renderCalendar(state.heat);
      renderModels(state.summary);
      renderChart(state.summary);
    }).catch(function (err) {
      banner('\u52A0\u8F7D\u5931\u8D25\uFF1A' + err.message + '\uFF08\u63D2\u4EF6\u5BBF\u4E3B\u672A\u91CD\u542F\uFF1F\u6570\u636E\u76EE\u5F55\u4E3A\u7A7A\uFF1F\uFF09');
    });
  }

  function setup() {
    // Embedded in the settings panel: offer an escape hatch to a standalone tab.
    if (window.location.search.indexOf('embed=1') >= 0) {
      document.getElementById('open-standalone').style.display = 'inline';
    }
    renderRangeButtons();
    var metricBtn = document.getElementById('metric');
    function renderMetric() {
      metricBtn.textContent = '\u70ED\u529B\u4F9D\u636E\uFF1A' + (state.metric === 'tokens' ? 'Tokens' : '\u8BF7\u6C42\u6570');
    }
    metricBtn.addEventListener('click', function () {
      state.metric = state.metric === 'tokens' ? 'requests' : 'tokens';
      renderMetric();
      if (state.heat) renderCalendar(state.heat);
    });
    renderMetric();
    document.getElementById('refresh').addEventListener('click', function () { void load(); });
    var auto = document.getElementById('auto');
    auto.addEventListener('change', function () { state.auto = auto.checked; syncTimer(); });
    function syncTimer() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      if (state.auto) state.timer = setInterval(function () { void load(); }, 30000);
    }
    syncTimer();
    void load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
</script>
</body>
</html>
`;

// src/routes.ts
var BASE = "/_dsh/usage-heatmap";
var DAY_MS = 864e5;
function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(bytes.length));
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(status);
  res.end(bytes);
}
function ok(res, value) {
  sendJson(res, 200, { ok: true, value });
}
function fail(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } });
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin === void 0 || origin === "") return true;
  const host = req.headers.host;
  if (host === void 0) return false;
  return origin === `http://${host}` || origin === `https://${host}`;
}
function readDays(req, fallback) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const raw = url.searchParams.get("days");
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 366) return fallback;
  return parsed;
}
function readInt(req, key, fallback, max) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) return fallback;
  return parsed;
}
function readString(req, key) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const raw = url.searchParams.get(key);
  return raw === null || raw === "" ? void 0 : raw;
}
function guard(req, res) {
  if (!sameOrigin(req)) {
    fail(res, 403, "forbidden", "cross-origin request refused");
    return false;
  }
  return true;
}
function requireGet(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    fail(res, 405, "method-not-allowed", "GET only");
    return false;
  }
  return true;
}
function registerUsageRoutes(webServer, store, options) {
  const summaryHandler = (req, res) => {
    if (!guard(req, res) || !requireGet(req, res)) return;
    const days = readDays(req, 30);
    ok(res, summarize(store.all(), days, options.pricing));
  };
  const heatmapHandler = (req, res) => {
    if (!guard(req, res) || !requireGet(req, res)) return;
    const weeks = readInt(req, "weeks", 26, 104);
    const now = Date.now();
    const until = startOfLocalDay(now) + DAY_MS - 1;
    const since = startOfLocalDay(now) - (weeks * 7 - 1) * DAY_MS;
    ok(res, { weeks, since, until, cells: heatmap(store.all(), weeks, since, until) });
  };
  const rawHandler = (req, res) => {
    if (!guard(req, res) || !requireGet(req, res)) return;
    const days = readDays(req, 30);
    const provider = readString(req, "provider");
    const model = readString(req, "model");
    const now = Date.now();
    const until = startOfLocalDay(now) + DAY_MS - 1;
    const since = startOfLocalDay(now) - (days - 1) * DAY_MS;
    const rows = rawRows(store.all(), since, until, provider, model);
    ok(res, { count: rows.length, rows: rows.slice(-2e3) });
  };
  const pageHandler = (req, res) => {
    if (!guard(req, res) || !requireGet(req, res)) return;
    const bytes = Buffer.from(PAGE_HTML);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(200);
    res.end(bytes);
  };
  const disposers = [
    webServer.register({ kind: "exact", path: `${BASE}/api/summary`, handler: summaryHandler }),
    webServer.register({ kind: "exact", path: `${BASE}/api/heatmap`, handler: heatmapHandler }),
    webServer.register({ kind: "exact", path: `${BASE}/api/raw`, handler: rawHandler }),
    webServer.register({ kind: "prefix", path: BASE, handler: pageHandler })
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// src/store.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
function keyOf(row) {
  return `${row.sessionId}:${row.seq}`;
}
var FLUSH_DELAY_MS = 200;
var UsageStore = class {
  rows = /* @__PURE__ */ new Map();
  watermarks = /* @__PURE__ */ new Map();
  filePath;
  watermarkPath;
  log;
  pendingLines = [];
  flushTimer;
  disposed = false;
  constructor(options) {
    this.log = options.log;
    mkdirSync(options.dir, { recursive: true });
    this.filePath = join(options.dir, "usage.jsonl");
    this.watermarkPath = join(options.dir, "watermarks.json");
  }
  /** Load persisted rows and watermarks. Malformed lines are skipped and counted. */
  load() {
    if (existsSync(this.filePath)) {
      let dropped = 0;
      for (const line of readFileSync(this.filePath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        try {
          const row = JSON.parse(trimmed);
          if (typeof row.seq !== "number" || typeof row.sessionId !== "string") {
            dropped += 1;
            continue;
          }
          this.rows.set(keyOf(row), row);
        } catch {
          dropped += 1;
        }
      }
      if (dropped > 0) this.log(`usage store: skipped ${dropped} malformed line(s)`);
    }
    if (existsSync(this.watermarkPath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.watermarkPath, "utf8"));
        for (const [id, seq] of Object.entries(parsed)) {
          if (typeof seq === "number") this.watermarks.set(id, seq);
        }
      } catch (error) {
        this.log(`usage store: watermarks unreadable, starting fresh: ${error.message}`);
      }
    }
  }
  /** All rows, in insertion order. */
  all() {
    return [...this.rows.values()];
  }
  /** Highest folded seq for one session (0 before anything was seen). */
  watermark(sessionId) {
    return this.watermarks.get(sessionId) ?? 0;
  }
  /**
   * Advance the session watermark to `seq` (monotonic; never rewinds).
   * Called for every event seen, so a session with no usage rows still stops
   * being re-inspected.
   */
  advanceWatermark(sessionId, seq) {
    const current = this.watermarks.get(sessionId) ?? 0;
    if (seq > current) {
      this.watermarks.set(sessionId, seq);
      this.scheduleFlush();
    }
  }
  /** Deduplicate and enqueue one batch of rows; returns the number actually added. */
  addRows(rows) {
    let added = 0;
    for (const row of rows) {
      const key = keyOf(row);
      if (this.rows.has(key)) continue;
      this.rows.set(key, row);
      this.pendingLines.push(JSON.stringify(row));
      added += 1;
    }
    if (added > 0) this.scheduleFlush();
    return added;
  }
  /** Number of in-memory rows. */
  get size() {
    return this.rows.size;
  }
  scheduleFlush() {
    if (this.disposed || this.flushTimer !== void 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = void 0;
      this.flush();
    }, FLUSH_DELAY_MS);
  }
  flush() {
    if (this.pendingLines.length === 0 && this.watermarks.size === 0) return;
    const lines = this.pendingLines;
    this.pendingLines = [];
    try {
      if (lines.length > 0) appendFileSync(this.filePath, `${lines.join("\n")}
`, "utf8");
      writeFileSync(this.watermarkPath, `${JSON.stringify(Object.fromEntries(this.watermarks), null, 2)}
`, "utf8");
    } catch (error) {
      this.log(`usage store: persist failed: ${error.message}`);
    }
  }
  /** Synchronously drain pending writes (plugin dispose). */
  dispose() {
    this.disposed = true;
    if (this.flushTimer !== void 0) {
      clearTimeout(this.flushTimer);
      this.flushTimer = void 0;
    }
    this.flush();
  }
};

// src/index.ts
var name = "dsh-usage-heatmap";
var Config = z.object({
  storePath: z.string().default(""),
  backfillOnStart: z.boolean().default(true),
  rescanMinutes: z.number().default(5),
  pricing: z.array(z.object({
    provider: z.string().required(),
    model: z.string().required(),
    input: z.number().required(),
    output: z.number().required(),
    cacheRead: z.number().required(),
    cacheWrite: z.number().required()
  })).default([])
});
var inject = ["webServer", "sessionPersistence"];
function apply(ctx, config) {
  const log = ctx.logger(name);
  const dir = config.storePath !== "" ? config.storePath : join2(resolveDshHome(), "storages", "dsh-usage-heatmap");
  const store = new UsageStore({ dir, log: (message) => log.warn(message) });
  store.load();
  log.info(`usage store: ${store.size} row(s) loaded from ${dir}`);
  ctx.on("session/event", (session, event) => {
    try {
      foldLiveEvent(store, session, event);
    } catch (error) {
      log.warn(`usage capture failed: ${error.message}`);
    }
  });
  if (config.backfillOnStart) {
    void runBackfill(ctx, store, (message) => log.info(message)).catch((error) => {
      log.warn(`usage backfill failed: ${error.message}`);
    });
  }
  if (config.rescanMinutes > 0) {
    const timer = setInterval(() => {
      void runBackfill(ctx, store, (message) => log.info(message)).catch((error) => {
        log.warn(`usage rescan failed: ${error.message}`);
      });
    }, config.rescanMinutes * 6e4);
    ctx.effect(() => {
      return () => {
        clearInterval(timer);
      };
    }, "dsh-usage-heatmap: rescan timer");
  }
  ctx.effect(() => {
    return () => {
      store.dispose();
    };
  }, "dsh-usage-heatmap: store");
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => {
      const disposeRoutes = registerUsageRoutes(webCtx.webServer, store, { pricing: config.pricing });
      return disposeRoutes;
    }, "dsh-usage-heatmap: web routes");
  });
}
export {
  Config,
  apply,
  inject,
  name
};
