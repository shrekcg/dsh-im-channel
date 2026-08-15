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
  // 任务只执行一次: 链在前一个之后, 结果供调用方 await; 守卫吞掉拒绝防队列中断
  const next = prev.then(task, task);
  const guard = next.catch(() => {});
  sessionQueues.set(sessionId, guard);
  try {
    return await next;
  } finally {
    if (sessionQueues.get(sessionId) === guard) {
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

/** 执行子进程并返回 {code, out, err}, 支持真超时强杀 (含进程组) 与流式行回调 */
function run(bin, args, opts = {}, log = () => {}) {
  return new Promise((resolve) => {
    // detached + 独立进程组, 超时才能杀整个进程树 (防子进程残留)
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts });
    let out = '';
    let err = '';
    let settled = false;
    let lineBuf = '';
    const done = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timeoutMs = opts.timeout || 0;
    const timer = timeoutMs ? setTimeout(() => {
      log(`[session] 超时 ${timeoutMs}ms, 强杀进程组 ${bin}`);
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) {} // 负 PID = 进程组
      try { child.kill('SIGKILL'); } catch (e) {}
    }, timeoutMs) : null;
    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      out += chunk;
      // 流式: 按行回调 (opts.onLine), 剩余半行缓存
      if (opts.onLine) {
        lineBuf += chunk;
        let idx;
        while ((idx = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.slice(0, idx).trim();
          lineBuf = lineBuf.slice(idx + 1);
          if (line) opts.onLine(line);
        }
      }
    });
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
async function runSession(config, msg, prompt, log = () => {}, accountId, onDelta) {
  const sessionId = deriveSessionId(msg, accountId);
  // 同一 session 串行执行 (并发安全), 不同 session 并行
  return withSessionLock(sessionId, () => doRunSession(config, sessionId, prompt, log, onDelta));
}

async function doRunSession(config, sessionId, prompt, log, onDelta) {
  const patchPath = path.join(config.dshHome, 'profiles', 'headless', 'node_modules', 'dsh-lark-session', 'cordis.patch.yml');

  log(`[session] 调用持久会话 ${sessionId} ...`);
  const t0 = Date.now();
  let streamedText = '';
  const res = await run(
    config.dshBin,
    ['--profile', 'headless', '--patch', patchPath, '--session', sessionId, prompt],
    {
      env: { ...process.env, DSH_HOME: config.dshHome },
      timeout: config.dshTimeoutMs,
      // 流式行回调: 解析 runner 的 NDJSON 流 (delta/done)
      onLine: (line) => {
        try {
          const msg2 = JSON.parse(line);
          if (msg2.type === 'delta' && msg2.text) {
            streamedText += msg2.text;
            if (onDelta) onDelta(msg2.text);
          }
        } catch (e) { /* 忽略非 JSON 行 */ }
      },
    },
    log
  );
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  log(`[session] 完成 ${dt}s code=${res.code}`);

  // 解析 runner 的 NDJSON 流输出: 找 type:'done' 行 (含 text/tools/thinking)
  let reply = streamedText || '';
  let outText = (res.out || '').trim();
  let seq;
  let tools = [];
  let thinking = '';
  // 逐行找 done 消息
  for (const line of outText.split('\n')) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'done') {
        if (!reply) reply = (parsed.text || '').trim();
        seq = parsed.seq;
        tools = Array.isArray(parsed.tools) ? parsed.tools : [];
        thinking = parsed.thinking || '';
        log(`[session] session=${parsed.sessionId} seq=${parsed.seq} reason=${parsed.reason} tools=${tools.length} thinking=${thinking ? 'yes' : 'no'}`);
        break;
      }
    } catch (e) { /* 跳过非 JSON 行 */ }
  }
  // 兼容旧格式 (单 JSON 无 type)
  if (!reply && !seq) {
    try {
      const parsed = JSON.parse(outText.split('\n')[0]);
      reply = (parsed.text || '').trim();
      seq = parsed.seq;
      tools = Array.isArray(parsed.tools) ? parsed.tools : [];
      thinking = parsed.thinking || '';
    } catch (e) {
      reply = outText; // 非 JSON 回退
    }
  }
  if (!reply && res.err) reply = '（处理出错）' + res.err.slice(0, 200);
  if (!reply) reply = '（无回复）';

  return { reply, sessionId, seq, tools, thinking };
}

module.exports = { deriveSessionId, runSession, run, withSessionLock };
