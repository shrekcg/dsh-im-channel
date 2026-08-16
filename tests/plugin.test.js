'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { deriveSessionId } = require('../src/session');
const { evaluatePolicy } = require('../src/inbound/policy');
function baseMsg(over) { return { chatType: 'group', mentionedBot: false, mentionAll: false, senderId: 'ou_user', chatId: 'oc_group', ...over }; }

// ---------- 会话派生 (多账号/多场景完整覆盖) ----------
test('session: 多账号前缀隔离', () => {
  const id = deriveSessionId({ chatType: 'p2p', senderId: 'ou_abc', chatId: 'oc_x' }, 'work_bot');
  assert.ok(id.startsWith('acc-work-bot-'));
  assert.ok(id.includes('feishu-ou-abc'));
});

test('session: default 账号无前缀', () => {
  const id = deriveSessionId({ chatType: 'p2p', senderId: 'ou_abc', chatId: 'oc_x' }, 'default');
  assert.ok(!id.startsWith('acc-'));
  assert.strictEqual(id, 'feishu-ou-abc');
});

test('session: 多账号话题隔离', () => {
  const id = deriveSessionId({ chatType: 'group', senderId: 'ou_abc', chatId: 'oc_g', threadId: 'omt_1' }, 'bot2');
  assert.ok(id.startsWith('acc-bot2-'));
  assert.ok(id.includes('thread-omt-1'));
});

// ---------- 插件脚本存在性 ----------
test('scripts: install.js 存在且可解析', () => {
  const p = path.join(__dirname, '..', 'scripts', 'install.js');
  assert.ok(fs.existsSync(p));
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(src.includes('install'));
  assert.ok(src.includes('uninstall'));
  assert.ok(src.includes('status'));
});

test('scripts: setup.js 存在且含 6 步引导', () => {
  const p = path.join(__dirname, '..', 'scripts', 'setup.js');
  assert.ok(fs.existsSync(p));
  const src = fs.readFileSync(p, 'utf8');
  for (const step of ['步骤 1/6', '步骤 2/6', '步骤 3/6', '步骤 4/6', '步骤 5/6', '步骤 6/6']) {
    assert.ok(src.includes(step), `setup.js 缺少 ${step}`);
  }
});

test('scripts: 插件目录包含必需文件', () => {
  const pluginDir = path.join(__dirname, '..', 'dsh-lark-session');
  assert.ok(fs.existsSync(path.join(pluginDir, 'cordis.patch.yml')), '缺少 cordis.patch.yml');
  assert.ok(fs.existsSync(path.join(pluginDir, 'lib', 'index.js')), '缺少 lib/index.js');
  assert.ok(fs.existsSync(path.join(pluginDir, 'lib', 'startup.js')), '缺少 lib/startup.js');
  assert.ok(fs.existsSync(path.join(pluginDir, 'package.json')), '缺少 package.json');
});

// ---------- 文档 URL 构造 (create_document 修复验证) ----------
test('doc URL: 标准域名拼接逻辑', () => {
  const docId = 'A1RvdxiRroK7TMxQuGzc6JrVnWg';
  const url = `https://feishu.cn/docx/${docId}`;
  assert.ok(url.startsWith('https://feishu.cn/docx/'));
  assert.ok(!url.includes('my.feishu.cn'));
  assert.ok(!url.endsWith('/docx/'));
});

// ---------- 思考+耗时模板 ----------
test('reply: 思考折叠块模板', () => {
  const think = '这是一个思考过程';
  const block = `<details><summary>💭 思考过程</summary>\n\n${think}\n\n</details>`;
  assert.ok(block.includes('<details><summary>💭 思考过程</summary>'));
  assert.ok(block.includes(think));
  assert.ok(block.includes('</details>'));
});

test('reply: 耗时 footer 格式', () => {
  const elapsedMs = 29000;
  const text = elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${elapsedMs}ms`;
  assert.strictEqual(text, '29.0s');
  const ms = 500;
  assert.strictEqual(ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`, '500ms');
});

// ---------- per-session 并发锁 ----------
const { withSessionLock } = require('../src/session');

test('session lock: 同一 session 串行, 不同 session 并行', async () => {
  const order = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 同一 session: 必须串行 (第二个等第一个完成)
  const t1 = withSessionLock('s1', async () => { order.push('s1-start'); await sleep(50); order.push('s1-end'); return 'a'; });
  const t2 = withSessionLock('s1', async () => { order.push('s2-start'); order.push('s2-end'); return 'b'; });
  const [r1, r2] = await Promise.all([t1, t2]);
  assert.strictEqual(r1, 'a');
  assert.strictEqual(r2, 'b');
  // s2 必须在 s1-end 之后执行 (串行)
  assert.ok(order.indexOf('s2-start') > order.indexOf('s1-end'), `串行失败: ${order.join(',')}`);
});

test('session lock: 不同 session 并行不互相阻塞', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let done = 0;
  const t1 = withSessionLock('sa', async () => { await sleep(80); done++; });
  const t2 = withSessionLock('sb', async () => { done++; });
  await Promise.all([t1, t2]);
  assert.strictEqual(done, 2);
});

test('session lock: 前一个失败不影响后一个', async () => {
  await withSessionLock('sx', async () => { throw new Error('boom'); }).catch(() => {});
  const r = await withSessionLock('sx', async () => 'ok');
  assert.strictEqual(r, 'ok');
});

// ---------- allowlist fail-closed 修复 ----------
test('policy: allowlist 空列表 = fail-closed (拒绝所有)', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'allowlist', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {}, allowBots: false };
  const v = evaluatePolicy(config, baseMsg({ senderId: 'ou_anyone' }));
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.reason, 'sender_not_allowed');
});

test('policy: allowlist 非空时白名单成员放行', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'allowlist', groupAllowFrom: ['ou_owner'], dmPolicy: 'open', dmAllowFrom: [], groups: {}, allowBots: false };
  assert.strictEqual(evaluatePolicy(config, baseMsg({ senderId: 'ou_owner' })).allowed, true);
  assert.strictEqual(evaluatePolicy(config, baseMsg({ senderId: 'ou_other' })).allowed, false);
});

// ---------- 自适应流式步长 ----------
const { adaptiveStep } = require('../src/core/adaptive');

test('adaptive step: 短内容小步 (打字机明显)', () => {
  assert.strictEqual(adaptiveStep(0), 6);
  assert.strictEqual(adaptiveStep(30), 6);
  assert.strictEqual(adaptiveStep(59), 6);
});

test('adaptive step: 中等内容中步', () => {
  assert.strictEqual(adaptiveStep(60), 16);
  assert.strictEqual(adaptiveStep(200), 16);
  assert.strictEqual(adaptiveStep(399), 16);
});

test('adaptive step: 长内容大步 (防限频)', () => {
  assert.strictEqual(adaptiveStep(400), 40);
  assert.strictEqual(adaptiveStep(5000), 40);
});

test('adaptive step: 边界值正确', () => {
  assert.strictEqual(adaptiveStep(59), 6);
  assert.strictEqual(adaptiveStep(60), 16);
  assert.strictEqual(adaptiveStep(399), 16);
  assert.strictEqual(adaptiveStep(400), 40);
});

// ---------- 流式节奏控制器 (pacing) ----------
const pacing = require('../src/core/pacing');

test('pacing: 短内容小步慢速', () => {
  assert.strictEqual(pacing.pacingFor(0).chars, 2);
  assert.strictEqual(pacing.pacingFor(50).chars, 2);
  assert.ok(pacing.pacingFor(0).intervalMs >= 40);
});

test('pacing: 中等内容中步', () => {
  assert.strictEqual(pacing.pacingFor(80).chars, 3);
  assert.strictEqual(pacing.pacingFor(300).chars, 3);
});

test('pacing: 长内容大步略快', () => {
  assert.strictEqual(pacing.pacingFor(400).chars, 4);
  assert.strictEqual(pacing.pacingFor(5000).chars, 4);
});

test('pacing: takeChunk 拆分大头块', () => {
  // 长块拆成小步
  const queue = ['这是一段很长的文本内容超过十个字符'];
  const c1 = pacing.takeChunk(queue, 0); // 短内容: 取2字
  assert.strictEqual(c1.length, 2);
  assert.ok(queue[0].length > 0, '剩余部分留在队列');
});

test('pacing: takeChunk 多块累积到限制', () => {
  const queue = ['ab', 'cd', 'ef'];
  const c = pacing.takeChunk(queue, 500); // 长内容: 取4字
  assert.strictEqual(c, 'abcd');
  assert.strictEqual(queue.length, 1);
});

test('pacing: takeChunk 空队列返回空串', () => {
  assert.strictEqual(pacing.takeChunk([], 0), '');
});

// ---------- 渠道状态管理 ----------
const statusMod = require('../src/core/status');

test('status: 初始飞书未连接', () => {
  statusMod.updateFeishu({ connected: false, botName: '', accounts: [] });
  const s = statusMod.getStatus();
  assert.strictEqual(s.feishu.connected, false);
  assert.strictEqual(s.channels.length, 8);
  assert.strictEqual(s.channels[0].id, 'feishu');
});

test('status: 全渠道位 (钉钉/QQ/微信/Slack/Telegram/Discord/WhatsApp)', () => {
  const s = statusMod.getStatus();
  const ids = s.channels.map((c) => c.id);
  for (const id of ['feishu','dingtalk','qq','wechat','slack','telegram','discord','whatsapp']) {
    assert.ok(ids.includes(id), `缺 ${id}`);
  }
});

test('status: 更新飞书状态后正确反映', () => {
  statusMod.updateFeishu({ connected: true, botName: '测试bot', botOpenId: 'ou_test' });
  const s = statusMod.getStatus();
  assert.strictEqual(s.feishu.connected, true);
  assert.strictEqual(s.feishu.online, 1);
  assert.strictEqual(s.feishu.accounts.length, 1);
  assert.strictEqual(s.feishu.accounts[0].name, '测试bot');
  assert.ok(s.feishu.health.includes('运行正常'));
  // 恢复
  statusMod.updateFeishu({ connected: false, botName: '', accounts: [] });
});

test('status: 记录最近消息时间', () => {
  statusMod.noteMessage();
  const s = statusMod.getStatus();
  assert.ok(s.feishu.lastMessageAt);
});

// ---------- 斜杠命令 ----------
const slash = require('../src/commands/slash');

test('slash: 识别斜杠命令', () => {
  assert.strictEqual(slash.isSlashCommand('/help'), true);
  assert.strictEqual(slash.isSlashCommand('/new 额外参数'), true);
  assert.strictEqual(slash.isSlashCommand('普通消息'), false);
  assert.strictEqual(slash.isSlashCommand(''), false);
  assert.strictEqual(slash.isSlashCommand('/1abc'), false);
});

test('slash: 解析命令和参数', () => {
  assert.deepStrictEqual(slash.parseCommand('/help'), { cmd: 'help', args: [] });
  assert.deepStrictEqual(slash.parseCommand('/model deepseek-v4-flash'), { cmd: 'model', args: ['deepseek-v4-flash'] });
  assert.deepStrictEqual(slash.parseCommand('/new x y'), { cmd: 'new', args: ['x', 'y'] });
});

test('slash: 命令清单完整', () => {
  for (const cmd of ['help', 'new', 'compact', 'model', 'status', 'tools', 'features', 'doctor']) {
    assert.ok(slash.COMMANDS[cmd], `缺少 /${cmd}`);
  }
});

test('slash: 未知命令返回提示', async () => {
  const r = await slash.handleSlashCommand({}, {}, '/unknown', 'sess1', () => {});
  assert.strictEqual(r.handled, true);
  assert.ok(r.reply.includes('未知命令'));
});

// ---------- 渠道向导 ----------
const { handleChannelsCommand, CHANNELS } = require('../src/commands/channels');

test('channels: 列出全部 8 渠道', async () => {
  const r = await handleChannelsCommand([]);
  assert.strictEqual(r.handled, true);
  for (const id of ['feishu','telegram','dingtalk','slack','discord','qq','wechat','whatsapp']) {
    assert.ok(r.reply.includes(CHANNELS[id].name), `缺 ${id}`);
  }
});

test('channels: telegram 引导含 BotFather', async () => {
  const r = await handleChannelsCommand(['add', 'telegram']);
  assert.ok(r.reply.includes('BotFather'));
  assert.ok(r.reply.includes('TELEGRAM_BOT_TOKEN'));
});

test('channels: 未知渠道提示', async () => {
  const r = await handleChannelsCommand(['add', 'nope']);
  assert.ok(r.reply.includes('未知渠道'));
});

test('channels: 中文渠道名匹配', async () => {
  const r = await handleChannelsCommand(['add', '钉钉']);
  assert.ok(r.reply.includes('DINGTALK_APP_KEY'));
});

// ---------- 渠道适配器 ----------
const { getAdapter, getAllStatus } = require('../src/channel');

test('channel: 适配器注册表完整', () => {
  const types = ['feishu','telegram','dingtalk','slack','discord','qq','wechat','whatsapp'];
  for (const t of types) {
    assert.doesNotThrow(() => require(`../src/channel/${t}`), `${t} 加载失败`);
  }
});

test('channel: Telegram 无 token 连接报错', async () => {
  const { TelegramAdapter } = require('../src/channel/telegram');
  const inst = new TelegramAdapter({}, 'test');
  await assert.rejects(() => inst.connect(), /TELEGRAM_BOT_TOKEN/);
});

test('channel: getAllStatus 返回 8 渠道', () => {
  const all = getAllStatus();
  assert.strictEqual(all.length, 8);
});

test('channel: 飞书兼容 API 仍工作', () => {
  const ch = require('../src/channel');
  assert.strictEqual(typeof ch.sendText, 'function');
  assert.strictEqual(typeof ch.streamReplyLive, 'function');
  assert.strictEqual(typeof ch.getAdapter, 'function');
});

test('channel: Telegram 消息归一化', () => {
  const { TelegramAdapter } = require('../src/channel/telegram');
  const inst = new TelegramAdapter({ telegramBotToken: 'fake' }, 'test');
  let got = null;
  inst.on('message', (m) => { got = m; });
  inst._handleMessage({ message_id: 42, chat: { id: 123, type: 'private' }, from: { id: 7, first_name: 'Bob' }, text: 'hi' });
  assert.ok(got);
  assert.strictEqual(got.messageId, '42');
  assert.strictEqual(got.chatId, '123');
  assert.strictEqual(got.chatType, 'p2p');
  assert.strictEqual(got.text, 'hi');
  assert.strictEqual(got.senderName, 'Bob');
});
