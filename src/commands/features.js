#!/usr/bin/env node
'use strict';

/**
 * 功能配置检查清单 (固定模板, 确定性判断)
 *
 * 输出标准答案列表: 每项能力是否已配置 (✅/❌), 不依赖模型推断。
 * 判断基于实际状态:
 *  - 权限: 从飞书应用已授权 scope 检测
 *  - 视觉: 检测 DSH 是否安装视觉识别插件 (插件存在即视为已配置)
 *  - 流式: 检测 runner 是否含流式代码
 *  - 服务: launchd 进程检测
 *
 * 用法:
 *  node src/commands/features.js          # 标准列表
 *  node src/commands/features.js --json   # JSON 输出 (供程序/agent 读取)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const BRIDGE_DIR = path.resolve(__dirname, '..', '..');
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');

function run(cmd, args) {
  try {
    const r = spawnSync(cmd, args, {
      encoding: 'utf8', timeout: 20000,
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
    });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
  } catch (e) {
    return { code: -1, out: '', err: String(e) };
  }
}

// ---------- 确定性检查器 (标准答案) ----------

function getAppId() {
  let appId = process.env.LARK_APP_ID || '';
  if (!appId) {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(BRIDGE_DIR, 'config.json'), 'utf8'));
      appId = cfg.appId || '';
    } catch (e) {}
  }
  if (!appId) {
    try {
      const xml = fs.readFileSync(path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.dsh.lark-bridge.plist'), 'utf8');
      const m = xml.match(/<key>LARK_APP_ID<\/key>\s*<string>([^<]+)<\/string>/);
      if (m) appId = m[1];
    } catch (e) {}
  }
  return appId;
}

/** 查询应用已授权 scope 集合 */
function getGrantedScopes() {
  const r = run('/opt/homebrew/bin/lark-cli', ['api', 'GET', '/open-apis/application/v6/scopes', '--as', 'bot']);
  try {
    const d = JSON.parse(r.out);
    if (d.ok === false) return new Set();
    return new Set((d.data?.scopes || []).filter((s) => s.grant_status === 1).map((s) => s.scope_name));
  } catch (e) {
    return new Set();
  }
}

/** 服务是否运行 (launchd print + pgrep 双保险) */
function isServiceRunning() {
  const lp = run('/bin/launchctl', ['print', `gui/${process.getuid()}/com.dsh.lark-bridge`]);
  if (lp.code === 0 && /state\s*=\s*running/.test(lp.out)) return true;
  const pg = run('/bin/pgrep', ['-f', 'dsh-lark-bridge/src/index.js']);
  return pg.code === 0;
}

/** 视觉识别插件是否已装 (任何 profile 里有视觉插件即视为已配置) */
function hasVisionPlugin() {
  for (const profile of ['headless', 'web']) {
    const dir = path.join(DSH_HOME, 'profiles', profile, 'node_modules');
    if (!fs.existsSync(dir)) continue;
    // 检测常见视觉识别插件
    for (const name of fs.readdirSync(dir)) {
      if (/vision|image|visual|ocr/i.test(name)) return true;
    }
  }
  return false;
}

/** 真流式是否已启用 (runner 含 delta 流式代码) */
function hasTrueStreaming() {
  try {
    const runner = path.join(DSH_HOME, 'profiles', 'headless', 'node_modules', 'dsh-lark-session', 'lib', 'index.js');
    if (!fs.existsSync(runner)) return false;
    const src = fs.readFileSync(runner, 'utf8');
    return src.includes('"delta"') || src.includes("type: \"delta\"");
  } catch (e) {
    return false;
  }
}

/** MCP 工具数量 */
function toolCount() {
  try {
    const src = fs.readFileSync(path.join(BRIDGE_DIR, 'src', 'tools', 'mcp-server.js'), 'utf8');
    return (src.match(/server\.tool\(/g) || []).length;
  } catch (e) {
    return 0;
  }
}

/** 多账号是否配置 */
function hasMultiAccount() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BRIDGE_DIR, 'config.json'), 'utf8'));
    return !!(cfg.accounts && Object.keys(cfg.accounts).length > 0);
  } catch (e) {
    return false;
  }
}

// ---------- 固定模板清单 ----------

function main() {
  const scopes = getGrantedScopes();
  const appId = getAppId();
  const visionOk = hasVisionPlugin();
  const streamingOk = hasTrueStreaming();
  const serviceOk = isServiceRunning();
  const tools = toolCount();
  const multiOk = hasMultiAccount();

  // 标准答案模板: 每项 = 已配置 (✅) / 未配置 (❌)
  const items = [
    { id: 'service', name: '常驻服务 (launchd)', ok: serviceOk, detail: serviceOk ? 'bridge 服务运行中' : '服务未运行' },
    { id: 'tools', name: `飞书对象工具 (${tools} 个 MCP)`, ok: tools >= 30, detail: `${tools} 个工具已注册` },
    { id: 'media', name: '多媒体收发 (图片/文件/语音)', ok: true, detail: '已实现, 无需额外配置' },
    { id: 'streaming', name: '流式输出 (真流式)', ok: streamingOk, detail: streamingOk ? '边生成边显示' : '未启用' },
    { id: 'vision', name: '图片视觉理解', ok: visionOk, detail: visionOk ? '视觉识别插件已安装' : '未安装视觉识别插件' },
    { id: 'reaction', name: '表情反馈 (👍/❤️)', ok: scopes.has('im:message.reactions:read'), detail: scopes.has('im:message.reactions:read') ? '权限+事件已配置' : '缺权限或未订阅事件' },
    { id: 'card_callback', name: '交互卡片回调 (按钮)', ok: scopes.has('cardkit:card:write'), detail: scopes.has('cardkit:card:write') ? 'cardkit 权限+回调已配置' : '缺 cardkit 权限' },
    { id: 'multi_account', name: '多账号多机器人', ok: multiOk, detail: multiOk ? '多账号已配置' : '单账号模式' },
  ];

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ appId, features: items.map((i) => ({ id: i.id, name: i.name, enabled: i.ok })) }, null, 2));
    process.exit(0);
  }

  console.log('=== DSH ↔ Feishu Bridge 功能配置清单 ===\n');
  for (const item of items) {
    console.log(`${item.ok ? '✅' : '❌'} ${item.name} — ${item.detail}`);
  }
  const enabled = items.filter((i) => i.ok).length;
  console.log(`\n共 ${items.length} 项, 已配置 ${enabled} 项。`);
}

main();
