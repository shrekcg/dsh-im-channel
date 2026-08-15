'use strict';

/**
 * 持久会话管理
 *
 * 会话模型（对齐 OpenClaw 的 threadScopedKey 思路）:
 *   P2P 私聊:   feishu-<openId>
 *   群聊主线:   feishu-g-<chatId>-<openId>
 *   话题消息:   feishu-g-<chatId>-thread-<threadId>   ← 完全独立上下文
 *
 * 通过 dsh-lark-session runner (agents.resume) 恢复固定会话, 跨消息保持记忆。
 */

const path = require('path');
const { spawn } = require('child_process');

// per-session 互斥队列: 同一 session 的消息串行处理 (避免并发恢复损坏会话文件)
// 不同 session 之间并行, 不互相阻塞
const sessionQueues = new Map();

/**
 * 按 sessionId 串行化执行: 同一 session 的任务排队, 前一个完成才跑下一个
 * @param {string} sessionId
 * @param {Function} task async 任务
 */
async function withSessionLock(sessionId, task) {
  const prev = sessionQueues.get(sessionId) || Promise.resolve();
  const next = prev.then(task, task); // 前一个无论成败都继续
  sessionQueues.set(sessionId, next.catch(() => {}));
  try {
    return await next;
  } finally {
    if (sessionQueues.get(sessionId) === next) {
      sessionQueues.delete(sessionId);
    }
  }
}

/** 派生 session id: 按"对话上下文"区分 (私聊/群聊主线/话题), 可带账号前缀 */
function deriveSessionId(msg, accountId) {
  const prefix = accountId && accountId !== 'default' ? `acc-${accountId.replace(/[^a-zA-Z0-9-]/g, '-')}-` : '';
  const sender = (msg.senderId || 'anonymous').replace(/[^a-zA-Z0-9-]/g, '-');
  const chat = (msg.chatId || 'unknown').replace(/[^a-zA-Z0-9-]/g, '-');
  const thread = msg.threadId || msg.rootId;
  if (thread) {
    const t = thread.replace(/[^a-zA-Z0-9-]/g, '-');
    return `${prefix}feishu-g-${chat}-thread-${t}`;
  }
  if (msg.chatType === 'group') {
    return `${prefix}feishu-g-${chat}-${sender}`;
  }
  return `${prefix}feishu-${sender}`;
}

/** 执行子进程并返回 {code, out, err}, 支持真超时强杀 */
function run(bin, args, opts = {}, log = () => {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    let settled = false;
    const done = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timeoutMs = opts.timeout || 0;
    const timer = timeoutMs ? setTimeout(() => {
      log(`[session] 超时 ${timeoutMs}ms, 强杀 ${bin}`);
      try { child.kill('SIGKILL'); } catch (e) {}
    }, timeoutMs) : null;
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => done({ code, out, err }));
    child.on('error', (e) => done({ code: -1, out, err: String(e) }));
  });
}

/**
 * 调 DSH 持久会话 runner 处理一条消息
 * @param {object} config 全局配置
 * @param {object} msg 消息对象 {senderId, chatId, chatType, threadId, rootId, content}
 * @param {function} log 日志函数
 * @returns {Promise<{reply: string, sessionId: string, seq?: number}>}
 */
async function runSession(config, msg, prompt, log = () => {}, accountId) {
  const sessionId = deriveSessionId(msg, accountId);
  // 同一 session 串行执行 (并发安全), 不同 session 并行
  return withSessionLock(sessionId, () => doRunSession(config, sessionId, prompt, log));
}

async function doRunSession(config, sessionId, prompt, log) {
  const patchPath = path.join(config.dshHome, 'profiles', 'headless', 'node_modules', 'dsh-lark-session', 'cordis.patch.yml');

  log(`[session] 调用持久会话 ${sessionId} ...`);
  const t0 = Date.now();
  const res = await run(
    config.dshBin,
    ['--profile', 'headless', '--patch', patchPath, '--session', sessionId, prompt],
    {
      env: { ...process.env, DSH_HOME: config.dshHome },
      timeout: config.dshTimeoutMs,
    },
    log
  );
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  log(`[session] 完成 ${dt}s code=${res.code}`);

  // 解析 runner 的 JSON 输出 {sessionId, text, reason, seq, tools, thinking}
  let reply = '';
  let outText = (res.out || '').trim();
  let seq;
  let tools = [];
  let thinking = '';
  try {
    const parsed = JSON.parse(outText.split('\n')[0]);
    reply = (parsed.text || '').trim();
    seq = parsed.seq;
    tools = Array.isArray(parsed.tools) ? parsed.tools : [];
    thinking = parsed.thinking || '';
    log(`[session] session=${parsed.sessionId} seq=${parsed.seq} reason=${parsed.reason} tools=${tools.length} thinking=${thinking ? 'yes' : 'no'}`);
  } catch (e) {
    reply = outText; // 非 JSON 回退
  }
  if (!reply && res.err) reply = '（处理出错）' + res.err.slice(0, 200);
  if (!reply) reply = '（无回复）';

  return { reply, sessionId, seq, tools, thinking };
}

module.exports = { deriveSessionId, runSession, run, withSessionLock };
