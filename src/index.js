#!/usr/bin/env node
'use strict';

/**
 * DSH ↔ 飞书 双向桥 (模块化版)
 *
 * 架构:
 *   src/config.js   配置管理
 *   src/channel.js  飞书通道 (SDK 收发)
 *   src/session.js  持久会话 (agents.resume)
 *   src/inbound/    入站处理 (policy / media / reaction)
 *   src/outbound/   出站处理 (streaming / mention)
 *
 * 启动方式:
 *   node src/index.js
 */

const path = require('path');

// launchd/文件重定向下 stdout 行缓冲可能不刷新; 强制同步写
process.stdout.write = (function (orig) {
  return function (chunk, enc, cb) {
    orig.call(process.stdout, chunk, enc, cb);
    try { fsSync(1); } catch (e) {}
  };
})(process.stdout.write);
process.stderr.write = (function (orig) {
  return function (chunk, enc, cb) {
    orig.call(process.stderr, chunk, enc, cb);
    try { fsSync(2); } catch (e) {}
  };
})(process.stderr.write);
function fsSync(fd) { try { require('fs').fsyncSync(fd); } catch (e) {} }

const { loadConfig } = require('./config');
const channel = require('./channel');
const session = require('./session');
const policy = require('./inbound/policy');
const media = require('./inbound/media');
const reaction = require('./inbound/reaction');
const mergeForward = require('./inbound/merge-forward');
const commentHandler = require('./inbound/comment');
const mention = require('./outbound/mention');

const BRIDGE_DIR = __dirname.replace(/\/src$/, '');

// 最近消息上下文映射: messageId → {chatId, chatType, threadId, rootId, senderId, senderIsBot}
// 用于 reaction 事件找到对应会话
const recentMessageContext = new Map();
const RECENT_CTX_TTL_MS = 30 * 60 * 1000; // 30 分钟

function rememberMessageContext(msg) {
  recentMessageContext.set(msg.messageId, {
    chatId: msg.chatId,
    chatType: msg.chatType,
    threadId: msg.threadId,
    rootId: msg.rootId,
    senderId: msg.senderId,
    senderIsBot: !!msg.senderIsBot,
    ts: Date.now(),
  });
  // 清理过期
  if (recentMessageContext.size > 200) {
    const now = Date.now();
    for (const [k, v] of recentMessageContext) {
      if (now - v.ts > RECENT_CTX_TTL_MS) recentMessageContext.delete(k);
    }
  }
}

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

// 已处理消息去重 (带 TTL, 防止无界增长内存泄漏)
const processedMessageIds = new Map(); // messageId -> timestamp
const PROCESSED_TTL_MS = 24 * 60 * 60 * 1000; // 24h 后自动清理

function isProcessed(messageId) {
  return processedMessageIds.has(messageId);
}

function markProcessed(messageId) {
  processedMessageIds.set(messageId, Date.now());
  // 定期清理过期条目 (防泄漏)
  if (processedMessageIds.size > 5000) {
    const now = Date.now();
    for (const [k, ts] of processedMessageIds) {
      if (now - ts > PROCESSED_TTL_MS) processedMessageIds.delete(k);
    }
  }
}

async function processMessage(config, msg, accountId) {
  if (isProcessed(msg.messageId)) return;
  markProcessed(msg.messageId);

  const t0 = Date.now(); // 处理起始时间 (用于耗时显示)

  // 记录消息上下文 (供 reaction 事件定位会话)
  rememberMessageContext(msg);

  log('[process]', {
    messageId: msg.messageId,
    chatId: msg.chatId,
    chatType: msg.chatType,
    mentionedBot: msg.mentionedBot,
    threadId: msg.threadId,
    senderId: msg.senderId,
    content: String(msg.content).slice(0, 60),
  });

  // 策略检查 (群/@/白名单/按群细粒度)
  const verdict = policy.evaluatePolicy(config, msg);
  if (!verdict.allowed) {
    log('[policy] 跳过:', verdict.reason);
    return;
  }

  // 构造内容: 文本 + 媒体描述
  let content = String(msg.content || '').trim();
  const rawType = msg.rawContentType || '';

  // 合并转发: 展开子消息内容
  if (mergeForward.isMergeForward(msg)) {
    try {
      const ch = channel.getChannel(config);
      const expanded = await mergeForward.expandMergeForward(ch, msg);
      content = expanded;
      log('[merge-forward] 已展开');
    } catch (e) {
      log('[merge-forward] 展开失败:', e.message);
    }
  }

  // 下载媒体 (图片/文件/音频/视频)
  let mediaText = '';
  try {
    const ch = channel.getChannel(config);
    const mediaList = await media.downloadMedia(ch, msg, config);
    mediaText = media.mediaToPromptText(mediaList);
  } catch (e) {
    log('[media] 处理失败:', e.message);
  }

  // 纯媒体消息: 去掉 markdown 图片语法占位, 用媒体描述代替
  if ((rawType === 'image' || rawType === 'file' || rawType === 'audio' || rawType === 'video') && !mediaText) {
    content = '';
  }
  if (mediaText) {
    // 移除 content 中的 markdown 图片/附件占位, 避免重复
    content = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')
      .trim();
  }

  // 纯媒体消息(无文本) 也给个占位
  if (!content && !mediaText) {
    log('[process] 空内容, 跳过');
    return;
  }

  // 体验: 立即加"思考中"表情
  await channel.addReaction(config, msg.messageId, 'THINKING');

  // 构造任务 → 持久会话
  const senderName = msg.senderName || msg.senderId || '用户';
  const prompt = [
    '这是飞书用户 {{sender_name}} 发给你的消息（持久会话，请结合之前的对话记忆回答）：',
    '',
    '【消息内容】',
    '{{content}}',
  ].join('\n')
    .replace('{{sender_name}}', senderName)
    .replace('{{content}}', content + (mediaText ? '\n\n' + mediaText : ''));

  const { reply, sessionId, tools, thinking } = await session.runSession(config, msg, prompt, log, accountId);

  // 思考过程: 记录日志 + 以可折叠块展示在回复前
  let thinkingText = '';
  if (thinking && thinking.trim()) {
    log('[thinking]', thinking.slice(0, 100));
    // 折叠块 (飞书 markdown 支持 details 折叠): 先显示"思考过程", 点击展开
    const shortThink = thinking.trim().length > 300 ? thinking.trim().slice(0, 300) + '…' : thinking.trim();
    thinkingText = `<details><summary>💭 思考过程</summary>\n\n${shortThink}\n\n</details>\n\n`;
  }

  // 工具追踪: 若 agent 调用了工具, 生成追踪摘要 (作为回复的前置提示)
  let toolTraceText = '';
  if (tools && tools.length) {
    toolTraceText = '\n\n> 🔧 已执行工具: ' + tools.map((t) => `\`${t.name}\``).join(' → ');
    log('[tools]', tools.map((t) => t.name).join(', '));
  }

  // 耗时 footer (对齐官方 footer.elapsed)
  const elapsedMs = Date.now() - t0;
  const elapsedText = elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${elapsedMs}ms`;
  const footerText = `\n\n---\n⚡ 处理耗时: ${elapsedText}${config.showModel ? ` · 🧠 ${config.showModel}` : ''}`;

  // 回复内容处理: 限制长度 + @ 渲染
  let finalReply = reply;
  if (finalReply.length > 1500) finalReply = finalReply.slice(0, 1500) + '…';
  finalReply = thinkingText + finalReply + toolTraceText + footerText;
  const { text: mentionText } = mention.convertMentions(finalReply);

  // 卡片流式回复
  const replyMsgId = await channel.streamReply(config, msg.chatId, msg.messageId, mentionText);
  log(`[reply] 回复完成 session=${sessionId} elapsed=${elapsedText}`);

  // 记录 bot 回复的上下文 (供 reaction 事件定位会话)
  if (replyMsgId) {
    recentMessageContext.set(replyMsgId, {
      chatId: msg.chatId,
      chatType: msg.chatType,
      threadId: msg.threadId,
      rootId: msg.rootId,
      senderId: msg.senderId,
      senderIsBot: true,
      ts: Date.now(),
    });
  }

  // 回复完成后移除"思考中"表情
  await channel.removeReaction(config, msg.messageId, 'THINKING');
}

async function main() {
  const config = loadConfig(BRIDGE_DIR);
  const accountIds = Object.keys(config.accounts);
  log('=== DSH-Lark Bridge (模块化版) 启动 ===');
  log('账号数: ' + accountIds.length, accountIds.join(', '));

  for (const accountId of accountIds) {
    const accConfig = { ...config, ...config.accounts[accountId] };
    log(`[account:${accountId}] 启动 appId=${accConfig.appId} requireMention=${accConfig.requireMention} groupPolicy=${accConfig.groupPolicy}`);

    const ch = channel.getChannel(accConfig, accountId);

    ch.on('message', async (msg) => {
      try {
        await processMessage(accConfig, msg, accountId);
      } catch (e) {
        log(`[account:${accountId}][msg] error:`, e.message);
      }
    });
    ch.on('reaction', async (evt) => {
      try {
        const ctx = recentMessageContext.get(evt.messageId);
        if (!ctx) {
          log('[reaction] 无消息上下文, 跳过 (30分钟窗口外)');
          return;
        }
        const feedback = await reaction.handleReaction(accConfig, evt, ctx);
        if (!feedback) return;
        const prompt = `【用户表情反馈】${feedback.feedbackText}`;
        const { reply } = await session.runSession(accConfig, {
          senderId: feedback.operatorId || ctx.senderId,
          chatId: ctx.chatId,
          chatType: ctx.chatType,
          threadId: ctx.threadId,
          rootId: ctx.rootId,
          content: '',
        }, prompt, log, accountId);
        if (reply && reply !== '（无回复）' && reply !== '（处理出错）') {
          const { text: mentionText } = mention.convertMentions(reply.slice(0, 500));
          await channel.streamReply(accConfig, ctx.chatId, evt.messageId, mentionText, accountId);
        }
      } catch (e) {
        log('[reaction] error:', e.message);
      }
    });
    ch.on('cardAction', async (evt) => {
      try {
        // ask_user_question 回调: 用户点击了选项按钮
        const option = evt.action?.value?.ask_user_option;
        const question = evt.action?.value?.question;
        if (option) {
          log(`[ask-user] 用户选择: ${option} (问题: ${question || '-'})`);
          // 把用户选择作为消息送进对应会话
          const prompt = `【用户对提问的回复】问题: ${question || ''}\n用户选择: ${option}`;
          const { reply } = await session.runSession(accConfig, {
            senderId: evt.operator?.openId || 'anonymous',
            chatId: evt.chatId,
            chatType: 'p2p',
            content: '',
          }, prompt, log, accountId);
          if (reply && reply !== '（无回复）' && reply !== '（处理出错）') {
            const { text: mentionText } = mention.convertMentions(reply.slice(0, 500));
            await channel.streamReply(accConfig, evt.chatId, evt.messageId, mentionText, accountId);
          }
          return { toast: { type: 'success', content: '已收到你的选择' } };
        }
        return undefined;
      } catch (e) {
        log('[cardAction] error:', e.message);
        return undefined;
      }
    });
    ch.on('reject', (e) => log(`[account:${accountId}][reject]`, JSON.stringify(e)));
    ch.on('comment', async (evt) => {
      try {
        const result = await commentHandler.handleComment(accConfig, evt);
        if (!result) return;
        // 调 DSH 处理文档评论
        const { reply } = await session.runSession(accConfig, {
          senderId: evt.operator?.openId || 'anonymous',
          chatId: `comment:${evt.fileToken}`,
          chatType: 'p2p',
          content: '',
        }, result.prompt, log, accountId);
        if (reply && reply !== '（无回复）' && reply !== '（处理出错）') {
          log(`[comment] 回复: ${reply.slice(0, 80)}`);
          // 通过文档评论 API 回复 (drive file.comment.replys create)
          const replyRes = await session.run(
            '/opt/homebrew/bin/lark-cli',
            ['drive', 'file.comment.replys', 'create',
              '--file-token', evt.fileToken,
              '--file-type', evt.fileType || 'docx',
              '--comment-id', result.commentId,
              '--data', JSON.stringify({ content: { elements: [{ type: 'text', text_run: { content: reply.slice(0, 500) } }] } }),
              '--as', 'user'],
            { env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } },
            log
          );
          log(`[comment] 回复已发布 code=${replyRes.code}`);
        }
      } catch (e) {
        log('[comment] error:', e.message);
      }
    });
    ch.on('error', (e) => log(`[account:${accountId}][channel] error:`, e.message));
    ch.on('reconnecting', () => log(`[account:${accountId}] reconnecting...`));
    ch.on('reconnected', () => log(`[account:${accountId}] reconnected`));

    await ch.connect();
    log(`[account:${accountId}] connected, bot=`, JSON.stringify(ch.botIdentity));
  }
  log('所有账号已连接, 等待飞书消息...');
}

process.on('SIGTERM', () => { log('SIGTERM, 退出'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT, 退出'); process.exit(0); });

main().catch((e) => { log('fatal', e); process.exit(1); });
