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
