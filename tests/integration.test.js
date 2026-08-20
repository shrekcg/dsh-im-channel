'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------- 媒体下载逻辑 (纯函数部分) ----------
const { extractResources, mediaToPromptText } = require('../src/inbound/media');

test('media: audio/video 资源被识别 (不再因 SDK type 限制失败)', () => {
  const msg = { resources: [
    { fileKey: 'img_1', type: 'image', sizeBytes: 100 },
    { fileKey: 'audio_1', type: 'audio', sizeBytes: 200 },
    { fileKey: 'video_1', type: 'video', sizeBytes: 300 },
  ]};
  const r = extractResources(msg);
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[1].type, 'audio');
  assert.strictEqual(r[2].type, 'video');
});

test('media: 语音/视频提示文本正确', () => {
  const t = mediaToPromptText([
    { type: 'audio', localPath: '/x/a.opus', sizeBytes: 2048 },
    { type: 'video', localPath: '/x/v.mp4', sizeBytes: 4096 },
  ]);
  assert.ok(t.includes('语音'));
  assert.ok(t.includes('视频'));
});

// ---------- 流式回退清理 (纯函数) ----------
test('reply: 回退剥离 HTML 标签', () => {
  const fullText = '<details><summary>💭 思考</summary>\n思考内容\n</details>\n\n这是回复 <at user_id="ou_1"></at>';
  const cleaned = fullText
    .replace(/<details><summary>[\s\S]*?<\/summary>[\s\S]*?<\/details>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  assert.ok(!cleaned.includes('<details>'));
  assert.ok(!cleaned.includes('<at'));
  assert.ok(cleaned.includes('这是回复'));
});

// ---------- @ 渲染后截断不切断标签 (从 index.js 提取的逻辑) ----------
test('mention: 截断不切断 <at> 标签', () => {
  const { convertMentions } = require('../src/outbound/mention');
  const rendered = convertMentions('请 @user:ou_abc123456789012345 查看，这是一个很长的测试文本').text;
  // 模拟 index.js 的截断逻辑: 截断到 1500 内确保不切断未闭合 <at> 标签
  const truncateSafe = (text, maxLen) => {
    if (text.length <= maxLen) return text;
    let truncated = text.slice(0, maxLen) + '…';
    const openAt = truncated.lastIndexOf('<at');
    const closeAt = truncated.lastIndexOf('</at>');
    if (openAt > closeAt) truncated = truncated.slice(0, openAt) + '…'; // 标签未闭合则回退到标签前
    return truncated;
  };
  // 短文本不截断 → 完整保留 @ 标签
  const full = truncateSafe(rendered, 500);
  assert.ok(full.includes('<at user_id="ou_abc123456789012345"></at>'));
  // 强制截断在标签内部 → 应回退到标签前 (不残留未闭合 <at)
  const truncated = truncateSafe(rendered.slice(0, rendered.indexOf('查看')), 10);
  assert.ok(!truncated.includes('<at user_id') || truncated.includes('</at>'), '截断不应留下未闭合 @ 标签: ' + truncated);
});

// ---------- MCP server 启动 (冒烟测试) ----------
test('mcp: server 能启动并注册工具', async () => {
  const serverPath = path.join(__dirname, '..', 'src', 'tools', 'mcp-server.js');
  assert.ok(fs.existsSync(serverPath));
  // 用 spawn 启动 MCP server, 验证能输出 ready 标记
  const child = spawn(process.execPath, [serverPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  const ready = new Promise((resolve) => {
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.includes('server ready')) resolve(true);
    });
    setTimeout(() => resolve(false), 8000);
  });
  const isReady = await ready;
  child.kill('SIGKILL');
  assert.ok(isReady, `MCP server 未在 8s 内 ready: ${stderr.slice(0, 200)}`);
});

// ---------- config 优先级 (config.json > env) ----------
test('config: config.json 优先于 env (双真相源修复)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lark-cfg2-'));
  // env 设置一个值, config.json 设置另一个 → config.json 应胜出
  fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ appId: 'cli_from_file', appSecret: 'secret_file', requireMention: true }));
  process.env.LARK_APP_ID = 'cli_from_env';
  process.env.LARK_APP_SECRET = 'secret_env';
  try {
    const { loadConfig } = require('../src/config');
    const cfg = loadConfig(tmpDir);
    assert.strictEqual(cfg.appId, 'cli_from_file');
    assert.strictEqual(cfg.appSecret, 'secret_file');
    assert.strictEqual(cfg.requireMention, true);
  } finally {
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
