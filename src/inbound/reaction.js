'use strict';

/**
 * 表情反馈感知 (对齐 OpenClaw reaction-handler)
 *
 * 模式 (config.reactionNotifications):
 *   off  — 忽略表情事件
 *   own  — 仅 bot 自己消息上的表情 → 派发给 agent
 *   all  — 任何消息上的表情 → 派发给 agent
 *
 * 收到 👍/❤️/👎 等表情时, 将反馈作为合成消息送入对应会话,
 * 让 agent 感知用户反馈 (可调整回复/确认操作完成)。
 */

const { deriveSessionId } = require('../session');

/** 表情 → 反馈语义 */
const REACTION_MEANING = {
  'THUMBSUP': '👍 用户点了赞 (表示认可/确认)',
  'THUMBSDOWN': '👎 用户点踩 (表示不认可, 可能需要调整)',
  'HEART': '❤️ 用户送心 (表示满意/喜欢)',
  'OK': '👌 用户表示 OK (确认)',
  'SMILE': '😊 用户微笑 (表示满意)',
  'THINKING': '🤔 用户表示思考/疑惑',
  'QUESTION': '❓ 用户表示疑问',
  'CRY': '😭 用户表示不满/失望',
  'WOW': '😮 用户表示惊讶',
};

function reactionToText(emojiType) {
  if (REACTION_MEANING[emojiType]) return REACTION_MEANING[emojiType];
  return `用户添加了表情: ${emojiType}`;
}

/**
 * 处理 reaction 事件
 * @param {object} config 配置
 * @param {object} evt SDK ReactionEvent {messageId, operator:{openId}, emojiType, action}
 * @param {object|null} msgContext 触发消息上下文 (可能为 null, 需反查)
 */
async function handleReaction(config, evt, msgContext) {
  if (config.reactionNotifications === 'off') return;

  // 忽略移除表情
  if (evt.action === 'removed') return;

  const feedbackText = reactionToText(evt.emojiType);

  // 无上下文时无法定位会话 → 跳过 (记录日志)
  if (!msgContext || !msgContext.chatId) {
    console.log(`[reaction] 无消息上下文, 跳过 (msgId=${evt.messageId})`);
    return null;
  }

  // 模式 own: 仅 bot 自己的消息 (由调用方判断 msgContext.senderIsBot)
  if (config.reactionNotifications === 'own' && !msgContext.senderIsBot) {
    console.log('[reaction] own 模式但非 bot 消息, 跳过');
    return null;
  }

  const sessionId = deriveSessionId(msgContext);
  console.log(`[reaction] ${evt.emojiType} → 会话 ${sessionId}: ${feedbackText}`);

  return {
    sessionId,
    feedbackText,
    emojiType: evt.emojiType,
    operatorId: evt.operator?.openId,
    messageId: evt.messageId,
  };
}

module.exports = { handleReaction, reactionToText };
