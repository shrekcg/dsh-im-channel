#!/usr/bin/env node
'use strict';

/**
 * 功能配置检查清单
 *
 * 让开发者一眼看到每项功能的配置状态:
 *  - ✅ 已配置 (可直接使用)
 *  - ⚠️ 部分配置 (可用但不完整)
 *  - ❌ 未配置 (需在后台/环境配置)
 *
 * 每项给出: 状态 + 配置方法 + 配置后如何验证
 *
 * 用法:
 *  node src/commands/features.js          # 完整清单
 *  node src/commands/features.js --json   # JSON 输出 (供程序读取)
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

// ---------- 各功能检查器 ----------

function checkEventSubscription(appId) {
  // 事件订阅无法通过 API 完全枚举, 检测 SDK 是否能收到 reaction 等事件需要实发
  // 这里做基础检查: 是否已配置事件相关权限 + 提示后台添加
  const r = run('/opt/homebrew/bin/lark-cli', ['api', 'GET', '/open-apis/application/v6/scopes', '--as', 'bot']);
  let granted = [];
  try {
    const d = JSON.parse(r.out);
    granted = (d.data?.scopes || []).filter((s) => s.grant_status === 1).map((s) => s.scope_name);
  } catch (e) {}
  const hasReactionPerm = granted.includes('im:message.reactions:read');
  const hasCardPerm = granted.includes('cardkit:card:write');
  return {
    hasReactionPerm,
    hasCardPerm,
    eventUrl: `https://open.feishu.cn/app/${appId}/event`,
  };
}

function checkVision() {
  // 检查 DSH 是否配置了 vision 能力 (visionpower 插件 + 多模态模型)
  const headlessVision = fs.existsSync(path.join(DSH_HOME, 'profiles', 'headless', 'node_modules', 'visionpower'));
  const webVision = fs.existsSync(path.join(DSH_HOME, 'profiles', 'web', 'node_modules', 'visionpower'));
  // 检查默认模型是否支持视觉 (settings.yaml 里模型名含 vision 或配置)
  let model = '';
  try {
    const settings = fs.readFileSync(path.join(DSH_HOME, 'settings.yaml'), 'utf8');
    const m = settings.match(/agent-default-model:[\s\S]*?model:\s*(\S+)/);
    model = m ? m[1] : '';
  } catch (e) {}
  const hasVisionPlugin = headlessVision || webVision;
  return { hasVisionPlugin, model, pluginLocation: headlessVision ? 'headless' : webVision ? 'web' : null };
}

function checkStreaming() {
  // 真流式已实现: runner 边生成边输出 delta 流, bridge 实时推送到卡片
  // 检测 runner 是否含流式代码 (delta 输出)
  let trueStreaming = false;
  try {
    const runnerPath = path.join(DSH_HOME, 'profiles', 'headless', 'node_modules', 'dsh-lark-session', 'lib', 'index.js');
    if (fs.existsSync(runnerPath)) {
      const src = fs.readFileSync(runnerPath, 'utf8');
      trueStreaming = src.includes('"delta"') || src.includes("type: \"delta\"");
    }
  } catch (e) {}
  return {
    current: trueStreaming ? 'true-streaming' : 'card-typewriter',
    trueStreaming,
  };
}

function checkMedia() {
  // 多媒体收发已实现
  return { receive: true, send: true };
}

function checkTools() {
  // MCP 工具数量
  const src = fs.readFileSync(path.join(BRIDGE_DIR, 'src', 'tools', 'mcp-server.js'), 'utf8');
  const count = (src.match(/server\.tool\(/g) || []).length;
  return { count };
}

function checkMultiAccount() {
  // config.json 的 accounts 或 env
  try {
    const cfgPath = path.join(BRIDGE_DIR, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return { enabled: !!cfg.accounts && Object.keys(cfg.accounts).length > 0, accounts: Object.keys(cfg.accounts || {}).length };
    }
  } catch (e) {}
  return { enabled: false, accounts: 0 };
}

function checkService() {
  // 检测 launchd 服务真实状态: launchctl print 可跨会话读取 (裸 launchctl list 在非 GUI 会话返回空, 会误报)
  const lp = run('/bin/launchctl', ['print', `gui/${process.getuid()}/com.dsh.lark-bridge`]);
  const viaPrint = lp.code === 0 && /state\s*=\s*running/.test(lp.out);
  const pg = run('/bin/pgrep', ['-f', 'dsh-lark-bridge/src/index.js']);
  const procRunning = pg.code === 0;
  return { running: viaPrint || procRunning };
}

// ---------- 主入口 ----------

function main() {
  // appId 从 env / config.json / launchd plist 读取
  let appId = process.env.LARK_APP_ID || '';
  if (!appId) {
    try {
      const cfgPath = path.join(BRIDGE_DIR, 'config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        appId = cfg.appId || appId;
      }
    } catch (e) {}
  }
  if (!appId) {
    try {
      const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.dsh.lark-bridge.plist');
      if (fs.existsSync(plistPath)) {
        const xml = fs.readFileSync(plistPath, 'utf8');
        const m = xml.match(/<key>LARK_APP_ID<\/key>\s*<string>([^<]+)<\/string>/);
        if (m) appId = m[1];
      }
    } catch (e) {}
  }
  const event = checkEventSubscription(appId);
  const vision = checkVision();
  const streaming = checkStreaming();
  const tools = checkTools();
  const multi = checkMultiAccount();
  const service = checkService();

  const checklist = [
    {
      id: 'service',
      name: '常驻服务 (launchd)',
      status: service.running ? 'ok' : 'missing',
      detail: service.running ? 'bridge 服务运行中' : '服务未运行',
      howTo: 'npm run install-bridge 或 launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dsh.lark-bridge.plist',
      verify: 'npm run doctor 第4项',
    },
    {
      id: 'tools',
      name: `飞书对象工具 (${tools.count} 个 MCP)`,
      status: tools.count >= 30 ? 'ok' : 'partial',
      detail: `${tools.count} 个工具已注册`,
      howTo: '无需配置, 自动可用',
      verify: '在飞书里说"查日程/读文档"测试',
    },
    {
      id: 'media',
      name: '多媒体收发 (图片/文件)',
      status: 'ok',
      detail: '图片/文件/语音接收+发送已实现',
      howTo: '无需配置',
      verify: '在飞书里发一张图片测试',
    },
    {
      id: 'streaming',
      name: '流式输出',
      status: streaming.trueStreaming ? 'ok' : 'partial',
      detail: streaming.trueStreaming ? '真流式 (边生成边显示)' : '卡片打字机 (处理后播放)',
      howTo: streaming.trueStreaming ? '已启用, 无需配置' : '需更新 DSH runner 支持流式',
      verify: '发消息观察是否边生成边显示',
    },
    {
      id: 'vision',
      name: '图片视觉理解',
      status: vision.hasVisionPlugin && isVisionModel(vision.model) ? 'ok' : vision.hasVisionPlugin ? 'partial' : 'missing',
      detail: vision.hasVisionPlugin
        ? `视觉识别插件已装 (${vision.pluginLocation}), 当前模型: ${vision.model || '未知'}`
        : '未检测到视觉识别插件',
      howTo: vision.hasVisionPlugin
        ? '若模型不支持视觉识别, 需在 DSH 配置中切换为支持视觉识别的模型'
        : '需配置视觉识别插件, 并在 DSH 中配置支持视觉识别的模型',
      verify: '在飞书发图片, 看是否识别内容',
    },
    {
      id: 'reaction',
      name: '表情反馈 (👍/❤️)',
      status: event.hasReactionPerm ? 'partial' : 'missing',
      detail: event.hasReactionPerm ? '权限已开, 需后台订阅事件' : '缺 im:message.reactions 权限',
      howTo: `后台事件订阅: ${event.eventUrl} 添加 im.message.reaction.created_v1`,
      verify: '给 bot 回复加 👍 表情, 看 agent 是否感知',
    },
    {
      id: 'card_callback',
      name: '交互卡片回调 (按钮)',
      status: event.hasCardPerm ? 'partial' : 'missing',
      detail: event.hasCardPerm ? 'cardkit 权限已开, 需后台配置回调' : '缺 cardkit:card 权限',
      howTo: `后台事件与回调→回调配置: ${event.eventUrl} 订阅 card.action.trigger`,
      verify: '发提问卡片点按钮, 看是否回调',
    },
    {
      id: 'multi_account',
      name: '多账号多机器人',
      status: multi.enabled ? 'ok' : 'partial',
      detail: multi.enabled ? `${multi.accounts} 个账号已配置` : '单账号模式',
      howTo: '在 config.json 配置 accounts 字段 (见 config.example.json)',
      verify: '多个 bot 分别发消息测试',
    },
  ];

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ appId, checklist }, null, 2));
    process.exit(0);
  }

  console.log('=== DSH ↔ Feishu Bridge 功能配置清单 ===\n');
  for (const item of checklist) {
    const icon = item.status === 'ok' ? '✅' : item.status === 'partial' ? '⚠️' : '❌';
    console.log(`${icon} ${item.name}`);
    console.log(`   状态: ${item.detail}`);
    console.log(`   配置: ${item.howTo}`);
    console.log(`   验证: ${item.verify}\n`);
  }
  const missing = checklist.filter((c) => c.status !== 'ok').length;
  console.log(`共 ${checklist.length} 项, ${missing} 项未完全配置。`);
  console.log('完整配置方法见 docs/SETUP.md, 或运行 npm run setup 向导。');
}

function isVisionModel(model) {
  // 常见多模态模型关键词 (visionpower 配置的模型通常带 vision/omni/vl)
  return /vision|omni|vl|visual|qwen.*max|gpt-4o|glm-4v/i.test(model || '');
}

main();
