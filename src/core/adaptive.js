'use strict';

/**
 * 自适应流式步长计算
 *
 * 根据已显示累计长度动态决定每次推送的字符数:
 * - 短内容 (<60字): 6 字/步 (打字机效果明显, 短回复也显示从容)
 * - 中等 (60-400字): 16 字/步 (平衡)
 * - 长内容 (>400字): 40 字/步 (减少刷新频率, 防飞书限频/卡顿)
 *
 * @param {number} seenLength 已显示累计长度
 * @returns {number} 本次推送步长
 */
function adaptiveStep(seenLength) {
  if (seenLength < 60) return 6;
  if (seenLength < 400) return 16;
  return 40;
}

module.exports = { adaptiveStep };
