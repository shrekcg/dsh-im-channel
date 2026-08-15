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

// chatType 反查缓存 (cardAction/comment 等无 chatType 的场景)
const chatTypeCache = new Map(); // chatId -> {chatType, ts}
const CHAT_TYPE_TTL = 30 * 60 * 1000;

/** 反查会话类型 (p2p|group), 带缓存; 失败回退 p2p */
async function resolveChatType(config, chatId) {
  if (!chatId) return 'p2p';
  const cached = chatTypeCache.get(chatId);
  if (cached && Date.now() - cached.ts < CHAT_TYPE_TTL) return cached.chatType;
  try {
    const res = await session.run(process.env.LARK_CLI || '/opt/homebrew/bin/lark-cli', ['im', '+chat-list', '--types', 'p2p,group', '--page-size', '50', '--as', 'bot'],
      { env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } }, log);
    const d = JSON.parse(res.out || '{}');
    const chats = d.data?.chats || d.data?.items || [];
    const found = chats.find((c) => c.chat_id === chatId || c.id === chatId);
    const chatType = found ? (found.chat_mode === 'p2p' ? 'p2p' : 'group') : 'p2p';
    chatTypeCache.set(chatId, { chatType, ts: Date.now() });
    return chatType;
  } catch (e) {
    return 'p2p';
  }
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

  // 合并转发: 仅当 SDK 未展开 (占位符) 时才二次拉取, 避免覆盖已展开内容
  if (mergeForward.isMergeForward(msg)) {
    const isPlaceholder = !content || content.includes('<forwarded_messages/>') || content.includes('Merged and Forwarded');
    if (isPlaceholder) {
      try {
        const ch = channel.getChannel(config);
        const expanded = await mergeForward.expandMergeForward(ch, msg);
        if (expanded && !expanded.includes('(无法展开')) content = expanded;
        log('[merge-forward] 已展开');
      } catch (e) {
        log('[merge-forward] 展开失败:', e.message);
      }
    } else {
      log('[merge-forward] SDK 已展开, 跳过二次拉取');
    }
  }

  // 下载媒体 (图片/文件/音频/视频)
  let mediaText = '';
  let visionHint = '';
  try {
    const ch = channel.getChannel(config);
    const mediaList = await media.downloadMedia(ch, msg, config);
    mediaText = media.mediaToPromptText(mediaList);
    // 视觉能力检测: 收到图片时判断 DSH 能否识别
    const hasImage = mediaList.some((m) => m.type === 'image');
    if (hasImage) {
      const vision = media.detectVisionCapability(config.dshHome);
      if (!vision.hasPlugin) {
        visionHint = '\n\n⚠️ 注意: 你发送了图片, 但当前环境未配置视觉识别插件, 无法识别图片内容。需配置视觉识别插件后才能看图。';
      } else if (!vision.isVisionModel) {
        visionHint = `\n\n⚠️ 注意: 你发送了图片, 但当前默认模型 (${vision.model || '未知'}) 可能不支持视觉识别, 可能无法识别图片内容。需切换为支持视觉识别的模型。`;
      }
    }
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

  // 体验: 立即加"思考中"表情; 用 try/finally 保证任何路径都移除 (防残留)
  await channel.addReaction(config, msg.messageId, 'THINKING');
  try {
    // 构造任务 → 持久会话
    const senderName = msg.senderName || msg.senderId || '用户';
    // 限制消息内容长度 (防 argv E2BIG: macOS 单参数约 256KB, 保守用 50KB)
    const MAX_CONTENT = 50 * 1024;
    let msgContent = content + (mediaText ? '\n\n' + mediaText : '') + visionHint;
    if (msgContent.length > MAX_CONTENT) {
      msgContent = msgContent.slice(0, MAX_CONTENT) + '\n…(内容过长已截断)';
    }
    const prompt = [
      '这是飞书用户 {{sender_name}} 发给你的消息（持久会话，请结合之前的对话记忆回答）：',
      '',
      '【输出要求】只输出最终结果/回答本身，不要描述你的操作过程（如"让我读取文件/运行命令/检查代码"等），不要自我复述任务。直接给用户干净、有用的答案。',
      '',
      '【功能清单指令】当用户问"功能清单/配置清单/哪些功能配了"等时，运行: node src/commands/features.js 并给用户简洁的清单总结：已配置哪些、未配置哪些、未配置的如何操作。',
      '',
      '【消息内容】',
      '{{content}}',
    ].join('\n')
      .replace('{{sender_name}}', senderName)
      .replace('{{content}}', msgContent);

    // 真流式: 生产-消费队列, onDelta 实时推入, 卡片流式消费显示
    const deltaQueue = [];
    let deltaDone = false;
    let streamOut = { reply: '', sessionId: '', tools: [], thinking: '', streamMsgId: null, streamedText: '' };
    {
      const runPromise = session.runSession(config, msg, prompt, log, accountId, (chunk) => {
        deltaQueue.push(chunk); // 生产: 实时推入队列
      });
      // 消费: 同时启动卡片流式, 从队列取增量实时显示
      const consumePromise = (async () => {
        try {
          const ch = channel.getChannel(config);
          await ch.connect();
          let seen = '';
          const msgId = await channel.streamReplyLive(config, msg.chatId, msg.messageId, async () => {
            // 小块多次返回 (6字符/次) + 轻量 pacing, 让打字机效果可见
            // (SDK 默认 100ms/50字符 节流在快速生成时几乎瞬时, 加 pacing 让流式可感知)
            const CHUNK = 6;
            const PACE_MS = 25;
            while (deltaQueue.length === 0 && !deltaDone) {
              await new Promise((r) => setTimeout(r, 30));
            }
            if (deltaQueue.length > 0) {
              const chunk = deltaQueue.shift();
              if (chunk.length > CHUNK) {
                deltaQueue.unshift(chunk.slice(CHUNK));
                const piece = chunk.slice(0, CHUNK);
                seen += piece;
                await new Promise((r) => setTimeout(r, PACE_MS)); // 显示节奏
                return piece;
              }
              seen += chunk;
              await new Promise((r) => setTimeout(r, PACE_MS));
              return chunk;
            }
            return null; // 结束
          });
          return { msgId, seen };
        } catch (e) {
          log('[stream-live] error:', e.message);
          return { msgId: null, seen: '' };
        }
      })();
      const result = await runPromise;
      deltaDone = true; // 通知消费结束
      const consumed = await consumePromise;
      streamOut = { ...result, streamMsgId: consumed.msgId, streamedText: consumed.seen };
    }
    const { reply, sessionId, tools, thinking } = streamOut;

    // 思考过程: 记录日志 (飞书不支持 details 折叠, 不注入正文避免标签泄漏)
    if (thinking && thinking.trim()) {
      log('[thinking]', thinking.slice(0, 200));
    }

    // 工具调用仅记录日志, 不展示在 footer (避免杂乱)
    if (tools && tools.length) {
      log('[tools]', tools.map((t) => t.name).join(', '));
    }

    // 耗时 footer (对齐 OpenClaw: 底部小字 "已完成 · 耗时 xx")
    const elapsedMs = Date.now() - t0;
    const elapsedText = elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${elapsedMs}ms`;
    const thinkMark = thinking && thinking.trim() ? ' · 💭' : '';
    const footerText = `✅ 已完成 · 耗时 ${elapsedText}${thinkMark}${config.showModel ? ` · ${config.showModel}` : ''}`;

    // 流式主体已实时显示; 完成后给卡片追加底部小字 footer (note 样式)
    const baseReply = (typeof reply === 'string' && reply) || '';
    let replyMsgId = streamOut.streamMsgId;
    if (replyMsgId) {
      // 追加 footer 小字到主体卡片 (hr 分隔 + notation 小字)
      const bodyClean = baseReply
        .replace(/<[^>]+>/g, '')       // 去掉 HTML 标签
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      await channel.appendCardFooter(config, replyMsgId, bodyClean || '(无内容)', footerText);
    } else {
      // 流式失败: 直接发完整 (正文 + footer)
      let finalReply = baseReply + '\n\n---\n' + footerText;
      const { text: mentionRendered } = mention.convertMentions(finalReply);
      if (mentionRendered.length > 1500) {
        let truncated = mentionRendered.slice(0, 1500) + '…';
        const openAt = truncated.lastIndexOf('<at');
        const closeAt = truncated.lastIndexOf('</at>');
        if (openAt > closeAt) truncated = truncated.slice(0, openAt) + '…';
        finalReply = truncated;
      } else {
        finalReply = mentionRendered;
      }
      replyMsgId = await channel.streamReply(config, msg.chatId, msg.messageId, finalReply);
    }
    log(`[reply] 回复完成 session=${sessionId} elapsed=${elapsedText} streamed=${streamOut.streamedText.length}B`);

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
  } finally {
    // 任何情况下都移除"思考中"表情 (防残留)
    await channel.removeReaction(config, msg.messageId, 'THINKING');
  }
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
          // 反查会话类型 (卡片可能在群里被点击, 不硬编码 p2p)
          const chatType = await resolveChatType(accConfig, evt.chatId);
          const prompt = `【用户对提问的回复】问题: ${question || ''}\n用户选择: ${option}`;
          const { reply } = await session.runSession(accConfig, {
            senderId: evt.operator?.openId || 'anonymous',
            chatId: evt.chatId,
            chatType,
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

    try {
      await ch.connect();
      log(`[account:${accountId}] connected, bot=`, JSON.stringify(ch.botIdentity));
    } catch (e) {
      // 单个账号连接失败不影响其他账号
      log(`[account:${accountId}] 连接失败:`, e.message, '(继续其他账号)');
    }
  }
  log('所有账号处理完成, 等待飞书消息...');
}

process.on('SIGTERM', () => { log('SIGTERM, 退出'); process.exit(0); });
process.on('SIGINT', () => { log('SIGINT, 退出'); process.exit(0); });

main().catch((e) => { log('fatal', e); process.exit(1); });
