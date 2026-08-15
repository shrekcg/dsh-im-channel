'use strict';

/**
 * 飞书通道封装
 *
 * 基于 @larksuite/channel SDK:
 *  - 接收: WSClient 完整事件字段 (chatType/mentionedBot/threadId/rootId/mentions)
 *  - 发送: 卡片流式 (stream), 表情 (reaction), 文本, 媒体
 */

const { createLarkChannel } = require('@larksuite/channel');

// 多账号实例缓存: accountId -> channel
const channelMap = new Map();

function getChannel(config, accountId) {
  // 用 appId 作为缓存 key (天然唯一标识账号), accountId 仅用于日志/命名
  const key = config.appId || accountId || 'default';
  if (channelMap.has(key)) return channelMap.get(key);
  if (!config.appSecret) throw new Error('[channel] LARK_APP_SECRET 未设置');
  const ch = createLarkChannel({
    appId: config.appId,
    appSecret: config.appSecret,
    loggerLevel: config.logLevel === 'debug' ? 'debug' : 'warn',
    policy: {
      requireMention: config.requireMention,
      dmMode: config.dmPolicy === 'closed' ? 'disabled' : 'open',
      respondToMentionAll: config.respondToMentionAll,
    },
  });
  channelMap.set(key, ch);
  return ch;
}

/** 加表情 */
async function addReaction(config, messageId, emoji = 'THINKING') {
  try {
    const ch = getChannel(config);
    await ch.connect();
    await ch.addReaction(messageId, emoji);
    return true;
  } catch (e) {
    console.error(`[channel] 加表情失败 ${emoji}:`, e.message);
    return false;
  }
}

/** 移除表情 */
async function removeReaction(config, messageId, emoji = 'THINKING') {
  try {
    const ch = getChannel(config);
    await ch.connect();
    return await ch.removeReactionByEmoji(messageId, emoji);
  } catch (e) {
    console.error('[channel] 移除表情失败:', e.message);
    return false;
  }
}

/**
 * 卡片流式打字机回复 (卡片整体替换, 不显示「已编辑」)
 * @returns {Promise<string>} 消息 ID
 */
async function streamReply(config, chatId, replyTo, fullText) {
  try {
    const ch = getChannel(config);
    await ch.connect();
    const res = await ch.stream(
      chatId,
      {
        markdown: async (c) => {
          // SDK stream 内置双阈值节流器 (自动控制卡片更新节奏),
          // 这里直接快速 append 全部块即可, 无需手动 sleep (避免每条回复凭空延迟)
          const chunkSize = Math.max(config.typingChunkSize, 8);
          for (let i = 0; i < fullText.length; i += chunkSize) {
            c.append(fullText.slice(i, i + chunkSize));
          }
        },
      },
      { replyTo }
    );
    return res.messageId;
  } catch (e) {
    console.error('[channel] 卡片流式失败, 回退文本:', e.message);
    const ch = getChannel(config);
    // 回退为普通文本消息: 剥离 HTML/折叠标签 (text 消息不渲染 markdown)
    const plainText = fullText
      .replace(/<details><summary>[\s\S]*?<\/summary>[\s\S]*?<\/details>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const s2 = await ch.send(chatId, { text: plainText || '(回复内容无法显示)' }, { replyTo });
    return s2.messageId;
  }
}

/** 直接发文本 (回复) */
async function sendText(config, chatId, text, opts = {}) {
  const ch = getChannel(config);
  await ch.connect();
  const res = await ch.send(chatId, { text }, opts.replyTo ? { replyTo: opts.replyTo } : {});
  return res.messageId;
}

/**
 * 发送媒体 (图片/文件/音频/视频)
 * @param {object} config 配置
 * @param {string} chatId 会话 ID
 * @param {object} media { type: 'image'|'file'|'audio'|'video', source: string|Buffer, fileName?, duration? }
 * @param {object} opts { replyTo? }
 */
async function sendMedia(config, chatId, media, opts = {}) {
  const ch = getChannel(config);
  await ch.connect();
  const sendOptions = opts.replyTo ? { replyTo: opts.replyTo } : {};
  let input;
  switch (media.type) {
    case 'image':
      input = { image: { source: media.source } };
      break;
    case 'audio':
      input = { audio: { source: media.source } };
      break;
    case 'video':
      input = { video: { source: media.source, duration: media.duration || 0 } };
      break;
    default:
      input = { file: { source: media.source, fileName: media.fileName || 'file' } };
  }
  const res = await ch.send(chatId, input, sendOptions);
  return res.messageId;
}

/** 连接并返回 channel 实例 */
async function connect(config) {
  const ch = getChannel(config);
  await ch.connect();
  return ch;
}

module.exports = { getChannel, connect, addReaction, removeReaction, streamReply, sendText, sendMedia };
