#!/usr/bin/env node
'use strict';

/**
 * 诊断与自修复 (doctor)
 *
 * 检查项:
 *  1. 配置 (appId/appSecret/账号)
 *  2. 依赖 (lark-cli / dsh / MCP SDK)
 *  3. 认证 (user token / bot 身份)
 *  4. 权限 (关键 scope)
 *  5. 服务 (launchd / WS 连接)
 *  6. 会话数据
 *
 * 用法:
 *  node src/commands/doctor.js           # 诊断
 *  node src/commands/doctor.js --fix     # 诊断 + 尝试自动修复
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const BRIDGE_DIR = path.resolve(__dirname, '..', '..');
const FIX = process.argv.includes('--fix');

let passed = 0;
let failed = 0;
let warnings = 0;

function report(name, ok, detail, fixHint) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    if (fixHint) console.log(`     修复建议: ${fixHint}`);
  }
}

function run(cmd, args) {
  try {
    const r = spawnSync(cmd, args, {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
    });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
  } catch (e) {
    return { code: -1, out: '', err: String(e) };
  }
}

function main() {
  console.log('=== DSH-Lark Bridge 诊断 ===');
  console.log(`模式: ${FIX ? '诊断 + 自动修复' : '仅诊断'}\n`);

  // ---------- 1. 配置 ----------
  console.log('[1] 配置检查');
  // 从 launchd plist 补充环境变量 (doctor 直接运行时可能没有)
  // 简单解析 plist 中的环境变量 (XML 文本提取)
  try {
    const plistPath = path.join(process.env.HOME, 'Library', 'LaunchAgents', 'com.dsh.lark-bridge.plist');
    if (fs.existsSync(plistPath) && !process.env.LARK_APP_SECRET) {
      const xml = fs.readFileSync(plistPath, 'utf8');
      const envBlock = xml.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
      if (envBlock) {
        const pairs = envBlock[1].match(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g) || [];
        for (const p of pairs) {
          const m = p.match(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/);
          if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
        }
      }
    }
  } catch (e) {}

  let config;
  try {
    config = require('../config').loadConfig(BRIDGE_DIR);
    const accountCount = Object.keys(config.accounts || {}).length;
    report('配置文件加载', true, `${accountCount} 个账号`);
    report('appId 设置', !!config.appId, config.appId);
    report('appSecret 设置', !!config.appSecret, '已配置');
  } catch (e) {
    report('配置文件加载', false, e.message);
    config = null;
  }
  console.log();

  // ---------- 2. 依赖 ----------
  console.log('[2] 依赖检查');
  const larkCli = process.env.LARK_CLI || '/opt/homebrew/bin/lark-cli';
  const dshBin = (config && config.dshBin) || process.env.DSH_BIN || path.join(process.env.HOME, '.local', 'bin', 'dsh');
  report('lark-cli', fs.existsSync(larkCli), larkCli, 'npm install -g @larksuite/cli');
  report('dsh', fs.existsSync(dshBin), dshBin, '请确认 DSH 已安装');
  const sdkOk = fs.existsSync(path.join(BRIDGE_DIR, 'node_modules', '@larksuite', 'channel'));
  report('@larksuite/channel SDK', sdkOk, '', 'npm install');
  const mcpOk = fs.existsSync(path.join(BRIDGE_DIR, 'node_modules', '@modelcontextprotocol', 'sdk'));
  report('MCP SDK', mcpOk, '', 'npm install @modelcontextprotocol/sdk');
  console.log();

  // ---------- 3. 认证 ----------
  console.log('[3] 认证检查');
  if (config) {
    // bot 身份
    const botStatus = run(larkCli, ['auth', 'status', '--json', '--verify']);
    let botOk = false;
    try {
      const d = JSON.parse(botStatus.out);
      const bot = d.identities && d.identities.bot;
      botOk = bot && bot.verified === true;
    } catch (e) {}
    report('bot 身份', botOk, '', '在开发者后台确认应用已启用/发布');
    if (FIX && !botOk) {
      console.log('      [fix] 尝试触发 bot 验证...');
      run(larkCli, ['auth', 'status', '--json', '--verify', '--as', 'bot']);
    }

    // 用户身份
    const userStatus = run(larkCli, ['whoami']);
    let userOk = false;
    let userName = '';
    try {
      const d = JSON.parse(userStatus.out);
      userOk = d.available === true;
      userName = d.onBehalfOf?.userName || d.identity === 'user' ? (d.onBehalfOf?.userName || '') : '';
    } catch (e) {}
    report('user 身份', userOk, userName || '', '运行 lark-cli auth login 重新授权');
  }
  console.log();

  // ---------- 4. 服务 ----------
  console.log('[4] 服务检查');
  const plist = path.join(process.env.HOME, 'Library', 'LaunchAgents', 'com.dsh.lark-bridge.plist');
  const launchdOk = fs.existsSync(plist);
  report('launchd plist', launchdOk, plist, '重新加载服务');
  if (launchdOk) {
    // 服务运行检测: launchctl list + pgrep 双保险 (print 单服务语法不可靠)
    const lc = run('/bin/launchctl', ['list']);
    const pg = run('/bin/pgrep', ['-f', 'dsh-lark-bridge/src/index.js']);
    const running = (lc.code === 0 && /com\.dsh\.lark-bridge/.test(lc.out)) || pg.code === 0;
    report('launchd 服务运行', running, '', 'launchctl bootstrap gui/$(id -u) ' + plist);
    if (FIX && !running) {
      console.log('      [fix] 启动服务...');
      run('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plist]);
    }
  }

  // bridge 进程
  const ps = run('/bin/ps', ['aux']);
  const bridgeRunning = ps.out.includes('dsh-lark-bridge') && ps.out.includes('node');
  report('bridge 进程', bridgeRunning, '', '检查 bridge.log 排错');
  console.log();

  // ---------- 5. 权限 (关键 scope + 工具所需) ----------
  console.log('[5] 权限检查');
  if (config) {
    const scopes = run(larkCli, ['api', 'GET', '/open-apis/application/v6/scopes', '--as', 'bot']);
    let granted = [];
    try {
      const d = JSON.parse(scopes.out);
      granted = (d.data && d.data.scopes || []).filter((s) => s.grant_status === 1).map((s) => s.scope_name);
    } catch (e) {}
    const required = ['im:message', 'im:message:readonly', 'im:resource', 'cardkit:card:write', 'im:message.p2p_msg:readonly'];
    for (const scope of required) {
      const ok = granted.includes(scope);
      report(`scope ${scope}`, ok, '', `在开发者后台申请: ${scope}`);
    }
    // 工具权限覆盖检查 (基于 TOOL_SCOPES 静态清单)
    const smScopes = require('../core/scope-manager').TOOL_SCOPES;
    const allToolScopes = [...new Set(Object.values(smScopes).flat())];
    const missingTool = allToolScopes.filter((s) => !granted.includes(s));
    report('工具权限覆盖', missingTool.length === 0, missingTool.length === 0 ? `${allToolScopes.length} 个工具权限全开通` : `缺失: ${missingTool.join(', ')}`, '在开发者后台批量申请缺失权限');
  }
  console.log();

  // ---------- 6. 会话数据 ----------
  console.log('[6] 会话数据');
  if (config) {
    const sessionsDir = path.join(config.dshHome, 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const dirs = fs.readdirSync(sessionsDir).filter((d) => d.includes('feishu') || d.includes('dsh-lark-bridge'));
      report('会话目录', dirs.length > 0, dirs.length > 0 ? `${dirs.length} 个目录` : '暂无会话(首次运行正常)');
    } else {
      report('会话目录', false, sessionsDir, '运行一次消息触发会话创建');
    }
  }
  console.log();

  // ---------- 7. 功能特性 ----------
  console.log('[7] 功能特性');
  const featuresSrc = fs.readFileSync(path.join(BRIDGE_DIR, 'src', 'commands', 'features.js'), 'utf8');
  // 流式检测
  let streamingOk = false;
  try {
    const runnerPath = path.join(config?.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
      'profiles', 'headless', 'node_modules', 'dsh-lark-session', 'lib', 'index.js');
    if (fs.existsSync(runnerPath)) {
      streamingOk = /"delta"|type: "delta"/.test(fs.readFileSync(runnerPath, 'utf8'));
    }
  } catch (e) {}
  report('真流式输出', streamingOk, streamingOk ? '边生成边显示' : '未启用', '更新 dsh-lark-session runner');
  // 视觉检测
  let visionOk = false;
  try {
    const base = path.join(config?.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles');
    for (const p of ['headless', 'web']) {
      const dir = path.join(base, p, 'node_modules');
      if (!fs.existsSync(dir)) continue;
      if (fs.readdirSync(dir).some((n) => /vision|image|visual|ocr/i.test(n))) { visionOk = true; break; }
    }
  } catch (e) {}
  report('图片视觉理解', visionOk, visionOk ? '视觉识别插件已安装' : '未安装', '安装视觉识别插件');
  console.log();

  // ---------- 8. 安全策略 ----------
  console.log('[8] 安全策略');
  const cfg = config || {};
  // dmPolicy/groupPolicy 显式配置检查 (防止漏配导致误拒绝或误开放)
  const dmSet = cfg.dmPolicy && cfg.dmPolicy !== 'closed';
  const gpSet = cfg.groupPolicy && cfg.groupPolicy !== 'closed';
  report('私聊策略 (dmPolicy)', dmSet, cfg.dmPolicy || 'closed (安全默认)', '如需开放: DM_POLICY=open');
  report('群聊策略 (groupPolicy)', gpSet, cfg.groupPolicy || 'closed (安全默认)', '如需开放: GROUP_POLICY=open');
  // 若开放但无白名单提示
  if ((cfg.dmPolicy === 'allowlist' && !cfg.dmAllowFrom?.length) ||
      (cfg.groupPolicy === 'allowlist' && !cfg.groupAllowFrom?.length)) {
    report('白名单配置', false, 'allowlist 模式但白名单为空 = 拒绝所有人', '配置 DM_ALLOW_FROM/GROUP_ALLOW_FROM');
  }
  console.log();

  // ---------- 汇总 ----------
  console.log('=== 诊断结果 ===');
  console.log(`通过: ${passed}  失败: ${failed}`);
  if (failed === 0) {
    console.log('🎉 全部检查通过!');
    process.exit(0);
  } else {
    console.log(`⚠️ 有 ${failed} 项需要处理` + (FIX ? '' : ' (可加 --fix 尝试自动修复)'));
    process.exit(1);
  }
}

main();
