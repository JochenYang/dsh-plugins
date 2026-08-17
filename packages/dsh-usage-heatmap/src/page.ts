/**
 * The heatmap page: a single self-contained HTML document (inline CSS/JS, no
 * external assets) served by the plugin route. It talks only to the plugin's
 * own `/api` endpoints on the same origin. All dynamic values are rendered
 * through textContent / attribute assignment — never innerHTML — so model or
 * provider names from the session logs cannot inject markup.
 */

const PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 用量热力图</title>
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
  <h1>DSH 用量热力图</h1>
  <span id="range" class="controls"></span>
  <span class="controls"><button id="metric" title="切换热力图颜色依据"></button></span>
  <button id="refresh">刷新</button>
  <label class="muted"><input type="checkbox" id="auto" checked> 自动刷新</label>
  <a id="open-standalone" href="/_dsh/usage-heatmap/" target="_blank" rel="noreferrer"
     style="display:none; margin-left:auto; color:var(--muted); text-decoration:none; font-size:12px;">在独立标签页打开 ↗</a>
</header>
<div id="banner"></div>
<section class="cards" id="cards"></section>
<section class="panel">
  <div class="cal-head">
    <h2>每日热力（最近 26 周）</h2>
    <div class="legend">少 <span class="cell" data-level="0"></span><span class="cell" data-level="1"></span><span class="cell" data-level="2"></span><span class="cell" data-level="3"></span><span class="cell" data-level="4"></span> 多</div>
  </div>
  <div id="cal-wrap"><div id="cal"></div></div>
</section>
<div class="row2">
  <section class="panel">
    <h2>按模型用量</h2>
    <table id="model-table"><thead><tr>
      <th>模型</th><th>请求</th><th>输入</th><th>输出</th><th>缓存读</th><th>缓存写</th><th>命中率</th><th>成本</th><th>占比</th>
    </tr></thead><tbody></tbody></table>
  </section>
  <section class="panel">
    <h2 id="trend-title">每日趋势</h2>
    <svg id="chart" viewBox="0 0 680 240" width="100%"></svg>
  </section>
</div>
<footer>
  数据来源：本机会话日志（assistant/message.usage，由 dsh-session 持久化）。仅统计适配器上报了 token 记账的请求；
  失败的请求与未上报 usage 的历史日志不计入。缓存命中率 = 缓存读 /（未命中输入 + 缓存读 + 缓存写）。
  成本为估算值，按插件配置的定价表（默认 DeepSeek 官方价目）计算；未匹配的模型不计成本。
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
  function fmtCost(n) { return n <= 0 ? '—' : '$' + (n < 0.01 ? n.toFixed(4) : n.toFixed(2)); }
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
      var b = el('button', days === state.range ? 'active' : '', days + '天');
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
      ['请求数', fmtInt(t.requests), ''],
      ['输入 tokens（未命中缓存）', fmtTokens(t.inputTokens), ''],
      ['输出 tokens', fmtTokens(t.outputTokens), ''],
      ['缓存命中率', fmtPct(t.cacheHitRate), t.cacheReadTokens + ' 读 / ' + (t.inputTokens + t.cacheWriteTokens) + ' 未命中'],
      ['缓存读 tokens', fmtTokens(t.cacheReadTokens), ''],
      ['缓存写 tokens', fmtTokens(t.cacheWriteTokens), ''],
      ['推理 tokens', fmtTokens(t.reasoningTokens), ''],
      ['估算成本', fmtCost(t.cost), t.cost > 0 ? '按配置定价表' : '未配置定价'],
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
    if (h2) h2.textContent = '每日热力（最近 26 周 · ' + fmtDate(heat.since) + ' ~ ' + fmtDate(heat.until) + '）';
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
    // never collide. Labels are compact ("2月", "3月", …) — two characters
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
      var label = (lStart.getMonth() + 1) + '月';
      var end = li + 1 < labelWeeks.length ? labelWeeks[li + 1] : weeks;
      var wd = el('div', 'wlabel', label);
      wd.style.gridRow = '1';
      wd.style.gridColumn = (lw + 2) + ' / span ' + Math.max(1, end - lw);
      cal.appendChild(wd);
    }
    // Day-of-week labels in column 1 (all seven, aligned to the window start).
    var dows = ['日', '一', '二', '三', '四', '五', '六'];
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
    tip.appendChild(el('div', '', '请求 ' + cell.requests + ' · 总 tokens ' + fmtTokens(cell.totalTokens)));
    tip.appendChild(el('div', '', '缓存命中率 ' + fmtPct(cell.cacheHitRate)));
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
    tip.appendChild(el('div', '', '请求 ' + fmtInt(d.requests) + ' · 命中率 ' + fmtPct(d.cacheHitRate)));
    tip.appendChild(el('div', '', '未命中输入 ' + fmtTokens(d.inputTokens) + ' · 缓存读 ' + fmtTokens(d.cacheReadTokens)));
    tip.appendChild(el('div', '', '缓存写 ' + fmtTokens(d.cacheWriteTokens) + ' · 输出 ' + fmtTokens(d.outputTokens)));
    tip.appendChild(el('div', '', '成本 ' + fmtCost(d.cost)));
    tip.style.display = 'block';
    moveTip(e);
  }

  function renderModels(t) {
    var tbody = document.querySelector('#model-table tbody');
    tbody.textContent = '';
    if (t.models.length === 0) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', 'muted', '暂无数据'));
      tbody.appendChild(tr);
      return;
    }
    t.models.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', '', m.model + (m.provider ? ' · ' + m.provider : '')));
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
    title.textContent = '每日趋势（近 ' + state.range + ' 天：未命中输入 / 缓存读 / 缓存写 / 输出，白线 = 命中率）';
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
      banner('加载失败：' + err.message + '（插件宿主未重启？数据目录为空？）');
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
      metricBtn.textContent = '热力依据：' + (state.metric === 'tokens' ? 'Tokens' : '请求数');
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
`

export { PAGE_HTML }
