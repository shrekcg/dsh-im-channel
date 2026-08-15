#!/usr/bin/env node
'use strict';

/**
 * DSH ↔ Feishu Bridge 初始化向导 (参考 OpenClaw 引导式初始化)
 *
 * 一步步引导完成:
 *  1. 前置检查 (node/lark-cli/dsh)
 *  2. 飞书应用配置 (appId/appSecret)
 *  3. 应用能力/权限检查
 *  4. 用户授权 (扫码)
 *  5. 事件订阅指引
 *  6. 安装/启动服务
 *
 * 用法: node scripts/setup.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');

const BRIDGE_DIR = path.resolve(__dirname, '..');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

async function step1_prereqs() {
  console.log('\n=== 步骤 1/6: 前置环境检查 ===');
  const checks = [
    ['Node.js', () => run('node', ['--version']).code === 0],
    ['lark-cli', () => fs.existsSync('/opt/homebrew/bin/lark-cli')],
    ['dsh', () => fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'dsh'))],
    ['npm 依赖', () => fs.existsSync(path.join(BRIDGE_DIR, 'node_modules'))],
  ];
  let allOk = true;
  for (const [name, check] of checks) {
    const ok = check();
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (!ok) allOk = false;
  }
  if (!allOk) {
    console.log('\n⚠️ 有前置依赖缺失:');
    console.log('  - lark-cli: npm install -g @larksuite/cli');
    console.log('  - dsh: 参考 DSH 安装文档');
    console.log('  - 依赖: cd dsh-lark-bridge && npm install');
    return false;
  }
  console.log('  ✅ 前置环境正常');
  return true;
}

async function step2_app_config() {
  console.log('\n=== 步骤 2/6: 飞书应用配置 ===');
  console.log('如果你还没有飞书应用:');
  console.log('  1. 打开 https://open.feishu.cn/app 创建"企业自建应用"');
  console.log('  2. 在"应用能力"中启用【机器人】');
  console.log('  3. 在"凭证与基础信息"中复制 App ID 和 App Secret');

  const currentAppId = process.env.LARK_APP_ID || '';
  if (currentAppId) {
    console.log(`\n检测到已配置 App ID: ${currentAppId}`);
    const reuse = await ask('是否复用现有配置? (y/n): ');
    if (reuse.toLowerCase() === 'y') return true;
  }

  const appId = (await ask('请输入 App ID (cli_开头): ')).trim();
  const appSecret = (await ask('请输入 App Secret: ')).trim();
  if (!appId || !appSecret) {
    console.log('❌ App ID 和 App Secret 不能为空');
    return false;
  }

  // 写入 config.json (合并现有)
  const cfgPath = path.join(BRIDGE_DIR, 'config.json');
  let cfg = {};
  if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.appId = appId;
  cfg.appSecret = appSecret;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log('✅ 已保存到 config.json (已加入 .gitignore, 不会提交)');
  return true;
}

async function step3_permissions() {
  console.log('\n=== 步骤 3/6: 应用能力与权限 ===');
  const appId = process.env.LARK_APP_ID || '';
  console.log('请在开发者后台完成以下配置:');
  console.log(`  1. 应用能力 → 启用【机器人】: https://open.feishu.cn/app/${appId}`);
  console.log('  2. 权限管理 → 添加以下关键权限:');
  console.log('     - im:message:send_as_bot (机器人发消息)');
  console.log('     - im:message:readonly (读取消息)');
  console.log('     - im:resource (图片/文件)');
  console.log('     - cardkit:card:write (流式卡片)');
  console.log('     - im:message.p2p_msg:readonly (接收私聊消息)');
  console.log('     (完整权限清单见 docs/SETUP.md, 支持 JSON 批量导入)');
  console.log('  3. 版本管理 → 创建版本并发布, 可用范围包含你的账号');
  const done = await ask('完成以上配置了吗? (y/n): ');
  return done.toLowerCase() === 'y';
}

async function step4_auth() {
  console.log('\n=== 步骤 4/6: 用户授权 ===');
  console.log('需要授权以用户身份操作飞书 (读文档/日历/任务等)');
  const r = run('/opt/homebrew/bin/lark-cli', ['auth', 'login', '--domain', 'all', '--no-wait', '--json']);
  try {
    const d = JSON.parse(r.out);
    console.log('请打开以下链接完成授权 (或用 lark-cli auth qrcode 生成二维码):');
    console.log(`  ${d.verification_url}`);
    const done = await ask('\n授权完成后按回车继续...');
    // 尝试完成授权
    const r2 = run('/opt/homebrew/bin/lark-cli', ['auth', 'login', '--device-code', d.device_code]);
    if (r2.out.includes('授权成功') || r2.out.includes('OK')) {
      console.log('✅ 授权成功!');
      return true;
    }
    console.log('⚠️ 授权可能未完成, 可稍后运行 lark-cli auth login');
    return false;
  } catch (e) {
    console.log('⚠️ 授权发起失败: ' + r.err.slice(0, 100));
    return false;
  }
}

async function step5_events() {
  console.log('\n=== 步骤 5/6: 事件订阅 (可选但推荐) ===');
  const appId = process.env.LARK_APP_ID || '';
  console.log('打开事件订阅页面, 添加以下事件 (接收方式选【长连接】):');
  console.log(`  🔗 https://open.feishu.cn/app/${appId}/event`);
  console.log('  推荐添加:');
  console.log('    - im.message.receive_v1 (必需, 消息接收)');
  console.log('    - im.message.reaction.created_v1 (表情反馈)');
  console.log('    - card.action.trigger (交互卡片)');
  console.log('    - drive.notice.comment_add_v1 (文档评论@)');
  const done = await ask('是否已配置事件订阅? (y=完成/n=跳过): ');
  return done.toLowerCase() === 'y';
}

async function step6_service() {
  console.log('\n=== 步骤 6/6: 启动服务 ===');
  console.log('安装 lark-session 插件并注册 launchd 常驻服务...');
  const r = run('node', [path.join(BRIDGE_DIR, 'scripts', 'install.js'), 'install']);
  console.log(r.out);
  console.log('✅ 初始化完成!');
  console.log('\n验证命令:');
  console.log('  npm run doctor   # 全面诊断');
  console.log('  npm test         # 运行测试');
  console.log('  然后在飞书里给机器人发消息即可对话');
}

async function main() {
  console.log('========================================');
  console.log('  DSH ↔ Feishu Bridge 初始化向导');
  console.log('  参考 OpenClaw 飞书插件引导式初始化');
  console.log('========================================');

  if (!(await step1_prereqs())) process.exit(1);
  if (!(await step2_app_config())) { console.log('配置未完成'); process.exit(1); }
  await step3_permissions();
  await step4_auth();
  await step5_events();
  await step6_service();
  rl.close();
}

main().catch((e) => { console.error('错误:', e.message); process.exit(1); });
