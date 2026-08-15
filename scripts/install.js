#!/usr/bin/env node
'use strict';

/**
 * DSH ↔ Feishu Bridge 插件安装/卸载脚本
 *
 * 功能:
 *  - install: 安装 lark-session 插件到 DSH headless profile + 注册 launchd 服务
 *  - uninstall: 移除插件注入 + 停止服务
 *  - status: 查看安装状态
 *
 * 用法:
 *  node scripts/install.js install
 *  node scripts/install.js uninstall
 *  node scripts/install.js status
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const BRIDGE_DIR = path.resolve(__dirname, '..');
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const HEADLESS_PROFILE = path.join(DSH_HOME, 'profiles', 'headless');
const LARK_SESSION_SRC = path.join(BRIDGE_DIR, 'dsh-lark-session');
const LARK_SESSION_DEST = path.join(HEADLESS_PROFILE, 'node_modules', 'dsh-lark-session');
const PLIST_SRC = path.join(BRIDGE_DIR, 'com.dsh.lark-bridge.plist');
const PLIST_DEST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.dsh.lark-bridge.plist');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function install() {
  console.log('=== 安装 DSH ↔ Feishu Bridge 插件 ===\n');

  // 1. 复制 lark-session 插件到 headless profile
  console.log('[1/4] 安装 lark-session 持久会话插件...');
  if (!fs.existsSync(LARK_SESSION_SRC)) {
    console.error('   ❌ 未找到 dsh-lark-session 插件目录:', LARK_SESSION_SRC);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(LARK_SESSION_DEST), { recursive: true });
  fs.rmSync(LARK_SESSION_DEST, { recursive: true, force: true });
  fs.cpSync(LARK_SESSION_SRC, LARK_SESSION_DEST, { recursive: true });
  console.log('   ✅ 已安装到', LARK_SESSION_DEST);

  // 2. 更新 lark-session 的 patch (注入 MCP + runner)
  console.log('[2/4] 配置 DSH 插件注入...');
  const patchPath = path.join(LARK_SESSION_DEST, 'cordis.patch.yml');
  let patch = fs.readFileSync(patchPath, 'utf8');
  // 确保 MCP server 路径指向当前 bridge 目录
  patch = patch.replace(
    /args: \['[^']*dsh-lark-bridge[^']*src\/tools\/mcp-server\.js'\]/,
    `args: ['${path.join(BRIDGE_DIR, 'src', 'tools', 'mcp-server.js').replace(/'/g, "\\'")}']`
  );
  fs.writeFileSync(patchPath, patch);
  console.log('   ✅ patch 已配置 MCP server 路径');

  // 3. 注册 launchd 服务
  console.log('[3/4] 注册 launchd 常驻服务...');
  if (!fs.existsSync(PLIST_SRC)) {
    console.warn('   ⚠️ 未找到 plist 模板, 跳过 launchd 注册');
  } else {
    // 从环境变量或 config.json 读取 appSecret (模板注入, 不提交明文)
    const cfgPath = path.join(BRIDGE_DIR, 'config.json');
    let appSecret = process.env.LARK_APP_SECRET || '';
    try {
      if (!appSecret && fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        appSecret = cfg.appSecret || '';
      }
    } catch (e) {}

    let plist = fs.readFileSync(PLIST_SRC, 'utf8');
    // 替换所有旧路径 (修复: 原正则含字面~永不匹配)
    const escapedDir = BRIDGE_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    plist = plist.replace(/<string>\/Users[^<]*dsh-lark-bridge[^<]*<\/string>/g,
      `<string>${BRIDGE_DIR.replace(/&/g, '&amp;')}</string>`);
    // 注入 appSecret (模板占位符 → 实际值)
    if (appSecret) {
      plist = plist.replace('__LARK_APP_SECRET__', appSecret);
    } else {
      console.warn('   ⚠️ 未找到 LARK_APP_SECRET (env 或 config.json), plist 将保留占位符');
    }
    fs.mkdirSync(path.dirname(PLIST_DEST), { recursive: true });
    fs.writeFileSync(PLIST_DEST, plist);
    run('launchctl', ['bootout', `gui/${process.getuid()}`, 'com.dsh.lark-bridge']);
    const r = run('launchctl', ['bootstrap', `gui/${process.getuid()}`, PLIST_DEST]);
    console.log(r.code === 0 ? '   ✅ launchd 服务已注册并启动' : '   ⚠️ launchd 启动可能需手动: ' + r.err.slice(0, 80));
  }

  // 4. 验证
  console.log('[4/4] 验证安装...');
  const lc = run('/bin/launchctl', ['list']);
  const running = lc.out.includes('com.dsh.lark-bridge');
  console.log(running ? '   ✅ 服务运行中' : '   ⚠️ 服务未运行 (运行 npm run doctor 排查)');

  console.log('\n✅ 安装完成! 运行 npm run doctor 验证, 或 npm run setup 完成初始化配置.');
}

function uninstall() {
  console.log('=== 卸载 DSH ↔ Feishu Bridge 插件 ===\n');

  // 1. 停止并移除 launchd
  console.log('[1/2] 停止并移除 launchd 服务...');
  run('launchctl', ['bootout', `gui/${process.getuid()}`, 'com.dsh.lark-bridge']);
  if (fs.existsSync(PLIST_DEST)) fs.rmSync(PLIST_DEST);
  console.log('   ✅ launchd 服务已移除');

  // 2. 移除 lark-session 插件
  console.log('[2/2] 移除 lark-session 插件...');
  if (fs.existsSync(LARK_SESSION_DEST)) {
    fs.rmSync(LARK_SESSION_DEST, { recursive: true, force: true });
    console.log('   ✅ 插件已从 DSH profile 移除');
  }

  console.log('\n✅ 卸载完成. DSH 核心未受影响.');
}

function status() {
  console.log('=== DSH ↔ Feishu Bridge 安装状态 ===\n');
  const larkSessionOk = fs.existsSync(LARK_SESSION_DEST);
  console.log(`lark-session 插件: ${larkSessionOk ? '✅ 已安装' : '❌ 未安装'}`);
  const plistOk = fs.existsSync(PLIST_DEST);
  console.log(`launchd plist: ${plistOk ? '✅ 已注册' : '❌ 未注册'}`);
  const lc = run('/bin/launchctl', ['list']);
  console.log(`launchd 运行: ${lc.out.includes('com.dsh.lark-bridge') ? '✅ 运行中' : '❌ 未运行'}`);
  const mcpOk = fs.existsSync(path.join(BRIDGE_DIR, 'node_modules', '@modelcontextprotocol', 'sdk'));
  console.log(`MCP SDK: ${mcpOk ? '✅ 已安装' : '❌ 缺失 (npm install)'}`);
}

const cmd = process.argv[2] || 'status';
switch (cmd) {
  case 'install': install(); break;
  case 'uninstall': uninstall(); break;
  case 'status': status(); break;
  default:
    console.log('用法: node scripts/install.js [install|uninstall|status]');
}
