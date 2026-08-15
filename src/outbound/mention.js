'use strict';

/**
 * @用户渲染 (对齐 OpenClaw outbound-mention)
 *
 * AI 回复文本中可以包含 @用户 指令, 格式:
 *   @user:<open_id> 或 @all
 * 发送前转换为飞书原生 mention (触发对方提醒)。
 *
 * 文本消息格式: <at user_id="ou_xxx"></at>
 */

/**
 * 把文本中的 @user:<id> / @all 指令转换为飞书原生 mention
 * @param {string} text 原始回复文本
 * @returns {{text: string, mentions: Array<{id: string, idType: string}>}}
 */
function convertMentions(text) {
  const mentions = [];
  // @user:ou_xxx
  const userRe = /@user:([a-zA-Z0-9_-]+)/g;
  let m;
  let out = text;
  while ((m = userRe.exec(text)) !== null) {
    const id = m[1];
    if (id.startsWith('ou_')) {
      out = out.replace(m[0], `<at user_id="${id}"></at>`);
      mentions.push({ id, idType: 'open_id' });
    } else {
      out = out.replace(m[0], `<at user_id="${id}"></at>`);
      mentions.push({ id, idType: 'user_id' });
    }
  }
  // @all
  out = out.replace(/@all/g, '<at user_id="all"></at>');
  if (out.includes('<at user_id="all"></at>')) {
    mentions.push({ id: 'all', idType: 'all' });
  }
  return { text: out, mentions };
}

module.exports = { convertMentions };
