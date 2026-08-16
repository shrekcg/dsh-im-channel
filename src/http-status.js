'use strict';

/**
 * HTTP 状态服务 (轻量, Node 原生 http, 无外部依赖)
 *
 * 参考 DSH「插件 → IM 机器人」设置页形态:
 *  - 渠道列表 (飞书 + 预留钉钉/QQ/微信)
 *  - 飞书状态详情 (在线/账号/消息通道/最近检查/健康/操作按钮)
 *
 * 路由:
 *  GET  /               渠道状态页 (HTML)
 *  GET  /api/status     JSON 状态 (供集成/未来 DSH 插件读取)
 *  POST /api/check      检查连接 (返回当前状态)
 *  POST /api/remove     移除接入 (停止服务, 可选)
 */

const http = require('http');
const { getStatus } = require('./core/status');

function renderPage(status) {
  const f = status.feishu;
  const channels = status.channels.map((c) => `
    <div class="channel ${c.current ? 'current' : ''} ${c.connected ? 'online' : 'offline'}">
      <span class="ch-icon">${c.icon}</span>
      <div class="ch-info">
        <div class="ch-name">${c.name}</div>
        <div class="ch-state">${c.connected ? '🟢 在线' : '⚪ 未配置'}</div>
      </div>
    </div>`).join('');

  const accounts = f.accounts.length ? f.accounts.map((a) => `
    <div class="account-card">
      <div class="acc-header">
        <span class="acc-name">${a.name}</span>
        <span class="acc-status online">🟢 ${a.status}</span>
      </div>
      <div class="acc-id">账号 ID: ${a.id}</div>
      <table class="acc-detail">
        <tr><td>消息通道</td><td>${a.messageChannel}</td></tr>
        <tr><td>最近检查</td><td>${a.lastChecked || '—'}</td></tr>
        <tr><td>最近消息</td><td>${f.lastMessageAt || '—'}</td></tr>
        <tr><td>运行时长</td><td>${f.uptimeText || '—'}</td></tr>
        <tr><td>进程 PID</td><td>${f.pid}</td></tr>
      </table>
      <div class="acc-health">${a.health}</div>
      <div class="acc-actions">
        <button onclick="checkConn()">检查连接</button>
        <button class="danger" onclick="removeConn()">移除接入</button>
      </div>
    </div>`).join('') : '<div class="no-account">暂无已接入账号</div>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>渠道管理 — DSH ↔ Feishu Bridge</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f6f8; color: #1f2329; padding: 24px; }
  .layout { display: flex; gap: 20px; max-width: 1100px; margin: 0 auto; }
  .panel { background: #fff; border-radius: 10px; border: 1px solid #e4e6eb; padding: 20px; }
  .sidebar { flex: 0 0 180px; }
  .sidebar .item { padding: 10px 12px; border-radius: 6px; cursor: pointer; color: #4e5969; font-size: 14px; }
  .sidebar .item.active { background: #e8f3ff; color: #3370ff; font-weight: 500; }
  .channel-list { flex: 0 0 200px; }
  .channel { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; margin-bottom: 6px; border: 1px solid transparent; }
  .channel.current { border-color: #3370ff; background: #f0f6ff; }
  .channel.offline { opacity: 0.55; }
  .ch-icon { font-size: 22px; }
  .ch-name { font-size: 14px; font-weight: 500; }
  .ch-state { font-size: 12px; color: #86909c; }
  .detail { flex: 1; }
  .detail h2 { font-size: 16px; margin-bottom: 4px; }
  .detail .sub { color: #86909c; font-size: 13px; margin-bottom: 16px; }
  .online-badge { display: inline-block; background: #e8fcea; color: #00b42a; font-size: 12px; padding: 2px 8px; border-radius: 10px; }
  .account-card { border: 1px solid #e4e6eb; border-radius: 8px; padding: 16px; margin-top: 12px; }
  .acc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .acc-name { font-weight: 600; }
  .acc-status.online { color: #00b42a; font-size: 13px; }
  .acc-id { color: #86909c; font-size: 12px; margin-bottom: 12px; }
  .acc-detail { width: 100%; border-collapse: collapse; font-size: 13px; }
  .acc-detail td { padding: 5px 0; }
  .acc-detail td:first-child { color: #86909c; width: 100px; }
  .acc-health { margin-top: 10px; padding: 8px 12px; background: #f7f8fa; border-radius: 6px; font-size: 13px; color: #4e5969; }
  .acc-actions { margin-top: 12px; display: flex; gap: 8px; }
  button { padding: 6px 14px; border-radius: 6px; border: 1px solid #c9cdd4; background: #fff; cursor: pointer; font-size: 13px; }
  button:hover { border-color: #3370ff; color: #3370ff; }
  button.danger { color: #f53f3f; border-color: #f53f3f; }
  button.danger:hover { background: #fef0f0; }
  .no-account { color: #86909c; font-size: 13px; padding: 16px 0; }
  .footer { max-width: 1100px; margin: 16px auto 0; color: #86909c; font-size: 12px; }
</style>
</head>
<body>
<div class="layout">
  <div class="panel sidebar">
    <div class="item">通用设置</div>
    <div class="item">模型</div>
    <div class="item active">插件</div>
    <div class="item">Agent 预设</div>
  </div>
  <div class="panel channel-list">
    <h3 style="font-size:14px;margin-bottom:4px">IM 机器人</h3>
    <div style="font-size:12px;color:#86909c;margin-bottom:12px">扫码/接入第三方渠道</div>
    ${channels}
  </div>
  <div class="panel detail">
    <h2>飞书机器人</h2>
    <div class="sub">通过 WebSocket 长连接把 DeepSeek Harness 接入飞书</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="online-badge">${f.online} / 1 在线</span>
      <span style="font-size:13px;color:#86909c">App ID: ${f.appId}</span>
    </div>
    <h3 style="font-size:14px;margin:16px 0 4px">已接入的飞书账号</h3>
    <div style="font-size:12px;color:#86909c">${f.accounts.length} 个</div>
    ${accounts}
  </div>
</div>
<div class="footer">
  DSH ↔ Feishu Bridge · serverTime: ${status.serverTime} · hostname: ${f.hostname}
</div>
<script>
async function checkConn() {
  const r = await fetch('/api/check', { method: 'POST' });
  const d = await r.json();
  alert(d.ok ? '✅ ' + d.health : '❌ 连接异常: ' + d.health);
  location.reload();
}
async function removeConn() {
  if (!confirm('确定移除飞书接入? bridge 服务将停止。')) return;
  const r = await fetch('/api/remove', { method: 'POST' });
  const d = await r.json();
  alert(d.message || '已处理');
}
</script>
</body>
</html>`;
}

/**
 * 启动 HTTP 状态服务
 * @param {number} port 端口 (默认 8899)
 */
function startStatusServer(port = 8899) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // CORS: 允许 DSH web (3080) 跨端口读取状态
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS 预检
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      const status = getStatus();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderPage(status));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      res.end(JSON.stringify(getStatus(), null, 2));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/check') {
      const s = getStatus().feishu;
      res.end(JSON.stringify({ ok: s.connected, health: s.health, lastChecked: s.lastChecked }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/remove') {
      // 移除接入: 停止 bridge (交给 launchd 的 KeepAlive 决策是否重启)
      res.end(JSON.stringify({ ok: true, message: '已请求移除接入, 服务停止中...' }));
      setTimeout(() => process.exit(0), 300);
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[status] HTTP 状态服务: http://127.0.0.1:${port}`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.warn(`[status] 端口 ${port} 被占用, 跳过 HTTP 服务`);
    else console.error('[status] HTTP 服务错误:', e.message);
  });
  return server;
}

module.exports = { startStatusServer, renderPage };
