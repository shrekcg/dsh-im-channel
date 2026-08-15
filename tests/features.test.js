'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { reactionToText, handleReaction } = require('../src/inbound/reaction');
const { extractResources, mediaToPromptText } = require('../src/inbound/media');
const { evaluatePolicy } = require('../src/inbound/policy');

function baseMsg(over) {
  return { chatType: 'group', mentionedBot: false, mentionAll: false, senderId: 'ou_user', chatId: 'oc_group', ...over };
}

// ---------- 表情反馈 ----------
test('reactionToText: 已知表情映射', () => {
  assert.ok(reactionToText('THUMBSUP').includes('👍'));
  assert.ok(reactionToText('HEART').includes('❤️'));
  assert.ok(reactionToText('THUMBSDOWN').includes('👎'));
});

test('reactionToText: 未知表情兜底', () => {
  assert.ok(reactionToText('UNKNOWN_EMOJI').includes('UNKNOWN_EMOJI'));
});

test('handleReaction: off 模式跳过', async () => {
  const r = await handleReaction({ reactionNotifications: 'off' }, { action: 'added', emojiType: 'HEART' }, { chatId: 'oc_x' });
  assert.strictEqual(r, undefined);
});

test('handleReaction: removed 动作跳过', async () => {
  const r = await handleReaction({ reactionNotifications: 'all' }, { action: 'removed', emojiType: 'HEART' }, { chatId: 'oc_x', senderIsBot: true });
  assert.strictEqual(r, undefined);
});

test('handleReaction: own 模式非 bot 消息跳过', async () => {
  const r = await handleReaction({ reactionNotifications: 'own' }, { action: 'added', emojiType: 'HEART' }, { chatId: 'oc_x', senderIsBot: false });
  assert.strictEqual(r, null);
});

test('handleReaction: all 模式返回反馈', async () => {
  const r = await handleReaction({ reactionNotifications: 'all' }, { action: 'added', emojiType: 'HEART', operator: { openId: 'ou_123' } }, { chatId: 'oc_x', chatType: 'p2p', senderId: 'ou_123', senderIsBot: false });
  assert.ok(r);
  assert.strictEqual(r.emojiType, 'HEART');
  assert.ok(r.feedbackText.includes('❤️'));
  assert.ok(r.sessionId);
});

// ---------- 媒体 ----------
test('extractResources: 提取资源描述', () => {
  const msg = { resources: [{ fileKey: 'img_1', type: 'image', sizeBytes: 100 }] };
  const r = extractResources(msg);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].fileKey, 'img_1');
});

test('extractResources: 无资源返回空', () => {
  assert.strictEqual(extractResources({}).length, 0);
});

test('mediaToPromptText: 图片友好描述', () => {
  const t = mediaToPromptText([{ type: 'image', localPath: '/x/a.img', sizeBytes: 2048 }]);
  assert.ok(t.includes('图片'));
  assert.ok(!t.includes('2048B')); // 不用原始字节
  assert.ok(t.includes('2.0KB'));
});

test('mediaToPromptText: 空列表返回空串', () => {
  assert.strictEqual(mediaToPromptText([]), '');
});

// ---------- 合并转发 ----------
const mergeForward = require('../src/inbound/merge-forward');

test('isMergeForward: rawContentType 识别', () => {
  assert.strictEqual(mergeForward.isMergeForward({ rawContentType: 'merge_forward' }), true);
  assert.strictEqual(mergeForward.isMergeForward({ rawContentType: 'text' }), false);
});

test('isMergeForward: messageType 识别', () => {
  assert.strictEqual(mergeForward.isMergeForward({ messageType: 'merge_forward' }), true);
  assert.strictEqual(mergeForward.isMergeForward({ messageType: 'image' }), false);
});

test('isMergeForward: 普通消息不是', () => {
  assert.strictEqual(mergeForward.isMergeForward({}), false);
});

// ---------- bot-at-bot ----------
test('policy: bot 消息默认被忽略', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {}, allowBots: false };
  const v = evaluatePolicy(config, baseMsg({ isBot: true }));
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.reason, 'sender_is_bot');
});

test('policy: allowBots=true 允许 bot 消息', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {}, allowBots: true };
  assert.strictEqual(evaluatePolicy(config, baseMsg({ isBot: true })).allowed, true);
});

test('policy: allowBots=mentions 需@才响应 bot', () => {
  const config = { requireMention: false, respondToMentionAll: true, groupPolicy: 'open', groupAllowFrom: [], dmPolicy: 'open', dmAllowFrom: [], groups: {}, allowBots: 'mentions' };
  assert.strictEqual(evaluatePolicy(config, baseMsg({ isBot: true })).allowed, false);
  assert.strictEqual(evaluatePolicy(config, baseMsg({ isBot: true, mentionedBot: true })).allowed, true);
});
