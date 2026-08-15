'use strict';

/**
 * 合并转发 (merge-forward) 识别与展开
 *
 * SDK 事件流收到的 merge_forward 消息 content 为占位 (<forwarded_messages/>),
 * 需显式调用 channel.fetchMessage(messageId) 才会递归展开子消息。
 * 本模块检测 merge_forward 类型并展开为可读文本。
 */

/**
 * 判断消息是否为合并转发
 * @param {object} msg SDK NormalizedMessage
 */
function isMergeForward(msg) {
  return msg.rawContentType === 'merge_forward' || msg.messageType === 'merge_forward';
}

/**
 * 展开合并转发消息内容
 * @param {object} channel SDK channel 实例
 * @param {object} msg SDK NormalizedMessage
 * @returns {Promise<string>} 展开后的可读文本
 */
async function expandMergeForward(channel, msg) {
  try {
    const fetched = await channel.fetchMessage(msg.messageId);
    if (fetched && fetched.content) {
      return `【合并转发消息】\n${fetched.content}`;
    }
  } catch (e) {
    console.error('[merge-forward] 展开失败:', e.message);
  }
  return '【合并转发消息】(无法展开内容)';
}

module.exports = { isMergeForward, expandMergeForward };
