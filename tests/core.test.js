'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { deriveSessionId } = require('../src/session');
const { evaluatePolicy } = require('../src/inbound/policy');
const { convertMentions } = require('../src/outbound/mention');

// ---------- 会话派生 ----------
test('deriveSessionId: P2P 私聊', () => {
  const id = deriveSessionId({ chatType: 'p2p', senderId: 'ou_abc123', chatId: 'oc_x' });
  assert.strictEqual(id, 'feishu-ou-abc123');
});

test('deriveSessionId: 群聊主线', () => {
  const id = deriveSessionId({ chatType: 'group', senderId: 'ou_abc', chatId: 'oc_xyz' });
  assert.strictEqual(id, 'feishu-g-oc-xyz-ou-abc');
});

test('deriveSessionId: 话题独立 session (threadId)', () => {
  const id = deriveSessionId({ chatType: 'group', senderId: 'ou_abc', chatId: 'oc_xyz', threadId: 'omt_123' });
  assert.strictEqual(id, 'feishu-g-oc-xyz-thread-omt-123');
});

test('deriveSessionId: 话题用 rootId 兜底', () => {
  const id = deriveSessionId({ chatType: 'group', senderId: 'ou_abc', chatId: 'oc_xyz', rootId: 'om_root' });
  assert.strictEqual(id, 'feishu-g-oc-xyz-thread-om-root');
});

// ---------- 群策略 ----------
function baseMsg(over) {
  return { chatType: 'group', mentionedBot: false, mentionAll: false, senderId: 'ou_user', chatId: 'oc_group', ...over };
}

test('policy: 默认 requireMention=false → 群消息直接放行', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {} };
  assert.strictEqual(evaluatePolicy(config, baseMsg()).allowed, true);
});

test('policy: requireMention=true 且未@ → 拒绝', () => {
  const config = { requireMention: true, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {} };
  const v = evaluatePolicy(config, baseMsg());
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.reason, 'no_mention');
});

test('policy: requireMention=true 且已@ → 放行', () => {
  const config = { requireMention: true, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {} };
  assert.strictEqual(evaluatePolicy(config, baseMsg({ mentionedBot: true })).allowed, true);
});

test('policy: 按群细粒度覆盖 (群A必须@, 群B不必须)', () => {
  const config = {
    requireMention: false, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [],
    groups: { oc_group: { requireMention: true } },
  };
  // 群A 未@ → 拒绝
  assert.strictEqual(evaluatePolicy(config, baseMsg({ chatId: 'oc_group' })).allowed, false);
  // 群B 未@ → 放行
  assert.strictEqual(evaluatePolicy(config, baseMsg({ chatId: 'oc_other' })).allowed, true);
});

test('policy: 群白名单 allowlist', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'allowlist', groupAllowFrom: ['ou_owner'], dmPolicy: 'open', dmAllowFrom: [], groups: {} };
  assert.strictEqual(evaluatePolicy(config, baseMsg({ senderId: 'ou_owner' })).allowed, true);
  assert.strictEqual(evaluatePolicy(config, baseMsg({ senderId: 'ou_other' })).allowed, false);
});

test('policy: 私聊 closed → 拒绝', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'closed', dmAllowFrom: [], groups: {} };
  const v = evaluatePolicy(config, { chatType: 'p2p', senderId: 'ou_user', chatId: 'oc_p2p' });
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.reason, 'dm_disabled');
});

// ---------- @ 渲染 ----------
test('convertMentions: @user:ou_xxx → 原生 at 标签', () => {
  const { text, mentions } = convertMentions('你好 @user:ou_abc123 请查收');
  assert.ok(text.includes('<at user_id="ou_abc123"></at>'));
  assert.strictEqual(mentions.length, 1);
  assert.strictEqual(mentions[0].idType, 'open_id');
});

test('convertMentions: @all → at all', () => {
  const { text, mentions } = convertMentions('@all 开会了');
  assert.ok(text.includes('<at user_id="all"></at>'));
  assert.strictEqual(mentions.length, 1);
});

test('convertMentions: 无 mention 保持原样', () => {
  const { text, mentions } = convertMentions('普通文本');
  assert.strictEqual(text, '普通文本');
  assert.strictEqual(mentions.length, 0);
});
