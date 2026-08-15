'use strict';

/**
 * 文档评论 @ 机器人 (对齐 OpenClaw comment-handler)
 *
 * 依赖: 后台订阅 drive.notice.comment_add_v1 事件
 * SDK comment 事件: {fileToken, fileType, commentId, operator, mentionedBot, timestamp}
 *
 * 当用户在云文档评论中 @ 机器人时, 机器人读取评论上下文并回复。
 */

/**
 * 处理文档评论事件
 * @param {object} config 配置
 * @param {object} evt SDK CommentEvent
 * @returns {Promise<{prompt: string, fileToken: string, commentId: string}|null>}
 */
async function handleComment(config, evt) {
  if (!evt.mentionedBot && config.commentMention !== false) {
    // 未 @ 机器人时默认不处理 (可配置 commentMention=true 处理所有评论)
    if (config.commentMention !== true) {
      console.log('[comment] 未@机器人, 跳过');
      return null;
    }
  }

  const prompt = [
    `用户在飞书云文档中评论并@了你。`,
    `文档类型: ${evt.fileType}, 文档 token: ${evt.fileToken}`,
    `评论 ID: ${evt.commentId}${evt.replyId ? `, 回复 ID: ${evt.replyId}` : ''}`,
    `操作者: ${evt.operator?.name || evt.operator?.openId || '未知'}`,
    '',
    '请读取文档评论上下文并给出回复。',
  ].join('\n');

  console.log(`[comment] @机器人 文档 ${evt.fileToken} 评论 ${evt.commentId}`);
  return { prompt, fileToken: evt.fileToken, commentId: evt.commentId };
}

module.exports = { handleComment };
