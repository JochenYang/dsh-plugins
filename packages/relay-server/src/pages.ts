/**
 * Phone-facing pages served by the relay (PROTOCOL §8). Both are zero-edit,
 * self-contained HTML — no framework, no build step. The `/pair` page posts
 * the pairing code, receives a `dsh-relay` session cookie in the response,
 * then redirects into `/d/<deviceId>/`, which the reverse proxy serves as a
 * transparent mirror of the desktop web UI.
 */

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0f1115; color: #e8eaed;
  }
  .card {
    width: min(92vw, 380px); padding: 28px 24px; border-radius: 16px;
    background: #1a1d24; border: 1px solid #2a2f3a;
  }
  h1 { font-size: 20px; margin-bottom: 6px; }
  .sub { color: #9aa3b2; font-size: 13px; margin-bottom: 18px; }
  label { display: block; font-size: 13px; color: #9aa3b2; margin-bottom: 6px; }
  input {
    width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #333a48;
    background: #13161c; color: #e8eaed; font-size: 18px; letter-spacing: 6px; text-align: center;
  }
  button {
    width: 100%; margin-top: 14px; padding: 12px; border: none; border-radius: 10px;
    background: #4c6ef5; color: #fff; font-size: 15px; cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  .err { color: #ff6b6b; font-size: 13px; margin-top: 10px; min-height: 18px; }
  a.link { display: inline-block; margin-top: 16px; color: #7d9bff; font-size: 13px; text-decoration: none; }
</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`
}

export function indexHtml(): string {
  return layout('DSH App — 配对', `
    <h1>DSH App</h1>
    <div class="sub">在手机上像桌面端一样操作 DeepSeek Harness</div>
    <a class="link" href="/pair">前往配对 →</a>
  `)
}

export function pairHtml(): string {
  return layout('DSH App — 配对', `
    <h1>手机配对</h1>
    <div class="sub">输入桌面端「设置 → 手机连接」显示的 6 位配对码</div>
    <form id="pairForm">
      <label for="code">配对码</label>
      <input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required>
      <button type="submit" id="submitBtn">配对并进入</button>
      <div class="err" id="err"></div>
    </form>
    <script>
      (function () {
        var form = document.getElementById('pairForm');
        var input = document.getElementById('code');
        var btn = document.getElementById('submitBtn');
        var err = document.getElementById('err');
        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          btn.disabled = true;
          err.textContent = '';
          try {
            var pairRes = await fetch('/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: input.value.trim() }),
            });
            var pair = await pairRes.json();
            if (!pairRes.ok || !pair.ok) {
              err.textContent = pair.error && pair.error.message ? pair.error.message : '配对失败，请重试';
              btn.disabled = false;
              return;
            }
            // Step 1 done: keep the long-lived token, then claim a browser
            // session cookie (HttpOnly) so the /d/* proxy knows who we are.
            localStorage.setItem('dsh-relay-token', pair.token);
            localStorage.setItem('dsh-relay-device', pair.deviceId);
            var claimRes = await fetch('/d/' + encodeURIComponent(pair.deviceId) + '/__claim', {
              headers: { 'x-dsh-relay-token': pair.token },
            });
            if (claimRes.status !== 200) {
              err.textContent = '会话建立失败，请重试';
              btn.disabled = false;
              return;
            }
            location.href = '/d/' + encodeURIComponent(pair.deviceId) + '/';
          } catch (error) {
            err.textContent = '网络错误，请重试';
            btn.disabled = false;
          }
        });
        // Scan flow: a ?code= query prefills the pairing code and submits.
        var params = new URLSearchParams(window.location.search);
        var pre = params.get('code');
        if (pre) {
          input.value = pre;
          btn.disabled = true;
          form.dispatchEvent(new Event('submit'));
        }
      })();
    </script>
  `)
}

export function adminHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH Relay — 管理台</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0f1115; color: #e8eaed; padding: 24px 16px 64px;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color: #9aa3b2; font-size: 13px; margin-bottom: 18px; }
  .card {
    background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 12px;
    padding: 16px; margin-bottom: 12px;
  }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .host-name { font-size: 15px; font-weight: 600; }
  .host-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #6b7583; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  }
  .ok { background: #123f2a; color: #4ade80; }
  .off { background: #3a2a12; color: #fbbf24; }
  .err { background: #3f1220; color: #f87171; }
  .meta { font-size: 12px; color: #9aa3b2; margin-top: 6px; }
  .pair-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 2px; font-size: 18px; font-weight: 700; color: #7d9bff; }
  .pair-exp { font-size: 11px; color: #6b7583; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #232833; }
  th { color: #9aa3b2; font-weight: 500; }
  td.sha { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #9aa3b2; }
  .empty { color: #6b7583; font-size: 12px; padding: 8px 0; }
  button {
    border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; transition: opacity .15s;
  }
  button:disabled { opacity: .45; cursor: default; }
  .btn-ghost { background: #232833; color: #e8eaed; }
  .btn-danger { background: #3f1220; color: #f87171; }
  .btn-primary { background: #4c6ef5; color: #fff; }
  .btn-warn { background: #3a2a12; color: #fbbf24; }
  .actions { display: flex; gap: 8px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .err-bar { color: #f87171; font-size: 12px; min-height: 16px; margin-bottom: 10px; }
  label { display: block; font-size: 13px; color: #9aa3b2; margin-bottom: 6px; }
  input[type=password] {
    width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #333a48;
    background: #13161c; color: #e8eaed; font-size: 15px;
  }
  .center-card { max-width: 380px; margin: 12vh auto 0; }
  .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
    background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 10px;
    padding: 10px 16px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 9; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div>
        <h1>DSH Relay 管理台</h1>
        <div class="sub" id="subline">连接状态</div>
      </div>
      <div class="actions">
        <button class="btn-ghost" id="refreshBtn">刷新</button>
        <button class="btn-ghost" id="logoutBtn">退出</button>
      </div>
    </div>
    <div class="err-bar" id="err"></div>
    <div id="panel"></div>
  </div>

  <div class="center-card card" id="loginCard" style="display:none">
    <h1>管理台登录</h1>
    <div class="sub">输入服务器配置的 --admin-token 口令</div>
    <label for="pw">管理口令</label>
    <input type="password" id="pw" autocomplete="current-password">
    <button class="btn-primary" id="loginBtn" style="width:100%; margin-top:14px">登录</button>
  </div>

  <div class="toast" id="toast"></div>

<script>
(function () {
  var errEl = document.getElementById('err');
  var panelEl = document.getElementById('panel');
  var loginCard = document.getElementById('loginCard');
  var sub = document.getElementById('subline');
  var toastEl = document.getElementById('toast');
  var timer = null;

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    setTimeout(function () { toastEl.style.opacity = '0'; }, 2200);
  }

  function err(text) { errEl.textContent = text; }

  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function since(ms) {
    if (!ms) return '—';
    var s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + ' 秒前';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    return Math.floor(s / 3600) + ' 小时前';
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderState(state) {
    var devices = state.devices || [];
    var totalOnline = 0;
    devices.forEach(function (d) { if (d.online) totalOnline++; });
    sub.textContent = state.now
      ? (devices.length + ' 台设备，' + totalOnline + ' 台在线 — 更新于 ' + fmtTime(state.now))
      : '连接状态';

    if (devices.length === 0) {
      panelEl.innerHTML = '<div class="card empty">暂无设备。桌面端 dsh-remote 插件连接中继后会自动注册。</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      var badge = d.online
        ? '<span class="badge ok">在线</span>'
        : (d.hostName ? '<span class="badge off">离线</span>' : '<span class="badge err">未连接</span>');
      var pairLine = d.pairActive
        ? '当前配对码 <span class="pair-code">' + d.pairCode + '</span> <span class="pair-exp">' +
          (d.pairExpiresAt > Date.now() ? '有效期至 ' + fmtTime(d.pairExpiresAt) + '（' + Math.ceil((d.pairExpiresAt - Date.now()) / 60000) + ' 分钟后）' : '已过期') +
          '</span>'
        : d.online ? '未生成配对码（桌面端刷新后出现）' : '设备离线，无法生成配对码';
      var phoneLine = d.phoneSessions > 0
        ? d.phoneSessions + ' 个手机会话在线'
        : '无手机会话';

      var tokenRows = '';
      if (d.tokens && d.tokens.length > 0) {
        tokenRows = '<table><thead><tr><th>令牌指纹（sha256 前缀）</th><th>签发时间</th><th>状态</th></tr></thead><tbody>';
        for (var j = 0; j < d.tokens.length; j++) {
          var t = d.tokens[j];
          tokenRows += '<tr><td class="sha">' + t.sha + '</td><td>' + fmtTime(t.createdAt) + '</td><td>' +
            (t.revokedAt ? '<span class="badge off">已吊销 ' + since(t.revokedAt) + '</span>' : '<span class="badge ok">有效</span>') + '</td></tr>';
        }
        tokenRows += '</tbody></table>';
      } else {
        tokenRows = '<div class="empty">无令牌记录</div>';
      }

      html += '<div class="card">' +
        '<div class="row">' +
          '<div>' +
            '<span class="host-name">' + esc(d.hostName || '未命名主机') + '</span> ' + badge +
            '<div class="host-id">' + d.deviceId.slice(0, 8) + '…（完整 ID: ' + d.deviceId + '）</div>' +
          '</div>' +
          '<div class="actions">' +
            '<button class="btn-ghost" data-action="disconnect" data-device="' + d.deviceId + '">断开手机</button>' +
            '<button class="btn-danger" data-action="revoke" data-device="' + d.deviceId + '">吊销设备</button>' +
          '</div>' +
        '</div>' +
        '<div class="meta">注册于 ' + fmtTime(d.createdAt) + ' · 最后心跳 ' + since(d.lastSeen) + '</div>' +
        '<div class="meta">' + pairLine + '</div>' +
        '<div class="meta">' + phoneLine + '</div>' +
        '<div class="meta" style="margin-top:10px; color:#6b7583">令牌清单</div>' +
        tokenRows +
      '</div>';
    }
    panelEl.innerHTML = html;
  }

  function attachActions() {
    var buttons = panelEl.querySelectorAll('button[data-action]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var btn = this;
        var device = btn.getAttribute('data-device');
        var action = btn.getAttribute('data-action');
        var verb = action === 'revoke' ? '吊销' : '断开';
        var confirmText = action === 'revoke'
          ? '吊销将作废该设备全部令牌并断开所有手机（桌面端需刷新重新生成配对码）。确定吊销 ' + device.slice(0, 8) + '… 吗？'
          : '将断开该设备当前所有手机会话连接。确定执行吗？';
        if (!window.confirm(confirmText)) return;
        btn.disabled = true;
        btn.textContent = '执行中…';
        doAction(action, device).then(function (res) {
          if (!res.ok) return Promise.reject(new Error(res.error && res.error.message || '操作失败'));
          showToast(verb + '成功');
        }).catch(function (e) {
          err(e.message);
        }).finally(function () {
          btn.disabled = false;
          btn.textContent = action === 'revoke' ? '吊销设备' : '断开手机';
          void loadState();
        });
      });
    }
  }

  function doAction(action, device) {
    return fetch('/admin/api/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device }),
    }).then(function (r) { return r.json(); });
  }

  function loadState() {
    if (timer) { clearTimeout(timer); timer = null; }
    return fetch('/admin/api/state', { headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (r.status === 401) throw { code: 'UNAUTHORIZED' };
        return r.json();
      })
      .then(function (state) {
        err('');
        loginCard.style.display = 'none';
        renderState(state);
        attachActions();
        timer = setTimeout(loadState, 8000);
      })
      .catch(function (e) {
        if (e && e.code === 'UNAUTHORIZED') {
          loginCard.style.display = '';
          panelEl.innerHTML = '';
          sub.textContent = '请先登录';
          return;
        }
        err('加载失败：' + (e.message || e));
        timer = setTimeout(loadState, 8000);
      });
  }

  function login() {
    var pw = document.getElementById('pw').value;
    if (!pw) return;
    document.getElementById('loginBtn').disabled = true;
    fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (!x.r.ok || !x.j.ok) {
          err('口令错误');
          document.getElementById('loginBtn').disabled = false;
          return;
        }
        err('');
        loginCard.style.display = 'none';
        void loadState();
      }).catch(function () {
        err('网络错误');
        document.getElementById('loginBtn').disabled = false;
      });
  }

  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  document.getElementById('refreshBtn').addEventListener('click', function () { void loadState(); });
  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/admin/logout', { method: 'POST' }).finally(function () {
      loginCard.style.display = '';
      panelEl.innerHTML = '';
      sub.textContent = '已退出';
    });
  });

  void loadState();
})();
</script>
</body>
</html>`
}
