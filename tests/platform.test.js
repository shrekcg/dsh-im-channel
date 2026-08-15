'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { loadConfig } = require('../src/config');
const { handleComment } = require('../src/inbound/comment');
const { scopeApplyUrl } = require('../src/core/scope-manager');

// ---------- 配置 ----------
test('config: 无账号时抛错', () => {
  assert.throws(() => loadConfig('/tmp/nonexistent-dir'));
});

test('config: 环境变量账号归一化为 default', () => {
  const old = { ...process.env };
  process.env.LARK_APP_ID = 'cli_test';
  process.env.LARK_APP_SECRET = 'secret';
  process.env.DSH_HOME = '/tmp/dsh-home';
  try {
    const cfg = loadConfig('/tmp/nonexistent-dir');
    assert.ok(cfg.accounts.default);
    assert.strictEqual(cfg.accounts.default.appId, 'cli_test');
    assert.strictEqual(cfg.accounts.default.appSecret, 'secret');
  } finally {
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
    delete process.env.DSH_HOME;
  }
});

// ---------- 文档评论 ----------
test('comment: @机器人时返回处理结果', async () => {
  const evt = {
    fileToken: 'docx_123', fileType: 'docx', commentId: 'comment_1',
    operator: { openId: 'ou_123', name: '张三' },
    mentionedBot: true, timestamp: 123,
  };
  const r = await handleComment({}, evt);
  assert.ok(r);
  assert.ok(r.prompt.includes('张三'));
  assert.strictEqual(r.fileToken, 'docx_123');
});

test('comment: 未@时跳过', async () => {
  const evt = { fileToken: 'docx_1', fileType: 'docx', commentId: 'c1', operator: {}, mentionedBot: false, timestamp: 1 };
  const r = await handleComment({}, evt);
  assert.strictEqual(r, null);
});

// ---------- 权限申请链接 ----------
test('scopeApplyUrl: 生成标准申请链接', () => {
  const url = scopeApplyUrl('cli_test', ['im:message', 'cardkit:card:write']);
  assert.ok(url.includes('clientID=cli_test'));
  assert.ok(url.includes('im%3Amessage'));
  assert.ok(url.includes('cardkit%3Acard%3Awrite'));
});

// ---------- 多账号配置 ----------
test('config: accounts 多账号加载', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lark-cfg-'));
  fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
    accounts: {
      bot2: { appId: 'cli_bot2', appSecret: 'sec2', requireMention: true },
    },
  }));
  process.env.LARK_APP_ID = 'cli_default';
  process.env.LARK_APP_SECRET = 'sec_default';
  try {
    const cfg = loadConfig(tmpDir);
    assert.deepStrictEqual(Object.keys(cfg.accounts).sort(), ['bot2', 'default']);
    assert.strictEqual(cfg.accounts.default.appId, 'cli_default');
    assert.strictEqual(cfg.accounts.bot2.requireMention, true);
  } finally {
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
