'use strict';

/**
 * 入站策略 (对齐 OpenClaw 群策略模型)
 *
 * 四种群模式:
 *   模式1: 仅应用创建者 @ 才响应 (groupPolicy=owner + requireMention)
 *   模式2: 任何人 @ 才响应 (requireMention=true)
 *   模式3: 不用 @ 所有消息都回复 (requireMention=false, 默认)
 *   模式4: 按群细粒度 (groups.oc_xxx.requireMention 覆盖全局)
 *
 * 私聊策略: dmPolicy open|allowlist|closed
 */

/**
 * 判断一条消息是否应被处理
 * @param {object} config 全局配置
 * @param {object} msg 消息 {chatType, mentionedBot, mentionAll, senderId, chatId, isBot}
 * @returns {{allowed: boolean, reason?: string}}
 */
function evaluatePolicy(config, msg) {
  const { chatType } = msg;

  // Bot 发送者处理 (bot-at-bot):
  //   allowBots=true      → 允许所有 bot 消息触发
  //   allowBots='mentions' → 仅 @ 本 bot 时触发
  //   未设置/false        → 忽略 bot 消息 (默认)
  if (msg.isBot) {
    const allowBots = config.allowBots;
    if (allowBots === true) {
      // 允许, 继续走下方策略
    } else if (allowBots === 'mentions') {
      if (!msg.mentionedBot && !msg.mentionAll) {
        return { allowed: false, reason: 'bot_not_mentioned' };
      }
    } else {
      return { allowed: false, reason: 'sender_is_bot' };
    }
  }

  // 私聊
  if (chatType !== 'group') {
    if (config.dmPolicy === 'closed') {
      return { allowed: false, reason: 'dm_disabled' };
    }
    if (config.dmPolicy === 'allowlist' && !config.dmAllowFrom.includes(msg.senderId)) {
      return { allowed: false, reason: 'sender_not_allowed' };
    }
    return { allowed: true };
  }

  // 群聊
  // 1. 群白名单 (allowlist 空列表 = fail-closed, 拒绝所有; 避免漏配全开放)
  if (config.groupPolicy === 'closed') {
    return { allowed: false, reason: 'group_not_allowed' };
  }
  if (config.groupPolicy === 'allowlist' && !config.groupAllowFrom.includes(msg.senderId)) {
    return { allowed: false, reason: 'sender_not_allowed' };
  }

  // 2. 按群细粒度: 该群的 requireMention 覆盖全局
  const groupCfg = (config.groups || {})[msg.chatId] || {};
  const requireMention = groupCfg.requireMention !== undefined
    ? groupCfg.requireMention
    : config.requireMention;

  // 3. @ 要求判断
  if (requireMention) {
    if (!msg.mentionedBot && !msg.mentionAll) {
      return { allowed: false, reason: 'no_mention' };
    }
  }
  // mentionAll 被禁止时
  if (msg.mentionAll && config.respondToMentionAll === false) {
    return { allowed: false, reason: 'mention_all_blocked' };
  }

  return { allowed: true };
}

module.exports = { evaluatePolicy };
