'use strict';

/**
 * 流式节奏控制器
 *
 * 设计目标: 统一处理多场景的流式显示, 让飞书卡片呈现平滑打字机效果。
 *
 * 核心原理:
 *   SDK 卡片流式的 Throttle 是双阈值 (ms 时间 / chars 字符量, 任一触发即 PATCH)。
 *   若消费端每次喂入 ≥ chars 的块, 会立即触发 PATCH 一整段 → 跳跃。
 *   正确做法: 每次只喂小块 (< chars/2), 让 Throttle 靠时间阈值逐步 PATCH,
 *   配合飞书 70ms 原生打字机动画 → 平滑。
 *
 * 场景处理:
 *   - 短内容 (<80字): 每 45ms 喂 2 字 (打字机明显但不拖沓)
 *   - 中等 (80-400字): 每 40ms 喂 3 字 (平衡)
 *   - 长内容 (>400字): 每 35ms 喂 4 字 (略快, 避免长回复太久)
 *   - 工具调用中: 由外层检测暂停流式 (见 index.js 的 useLiveStream 逻辑)
 *
 * 通用性: 节奏只依赖"已显示长度"单调递增, 不感知内容类型,
 * 对任何输出都产生一致的渐进显示。
 */

/** 计算本次喂入的字符数与间隔 */
function pacingFor(seenLength) {
  if (seenLength < 80) return { chars: 2, intervalMs: 45 };
  if (seenLength < 400) return { chars: 3, intervalMs: 40 };
  return { chars: 4, intervalMs: 35 };
}

/**
 * 从 delta 队列取一小块 (不超过 pacing 限制), 供 SDK append
 * @param {string[]} queue delta 队列 (先进先出)
 * @param {number} seenLength 已显示长度
 * @returns {string} 本次要 append 的文本 (可为空)
 */
function takeChunk(queue, seenLength) {
  if (!queue || queue.length === 0) return '';
  const { chars } = pacingFor(seenLength);
  let acc = '';
  while (queue.length > 0 && acc.length < chars) {
    const head = queue[0];
    if (acc.length + head.length <= chars) {
      acc += queue.shift();
    } else {
      // 头块太大, 拆出一部分
      const need = chars - acc.length;
      acc += head.slice(0, need);
      queue[0] = head.slice(need);
    }
  }
  return acc;
}

/** 计算下一次喂入前的等待间隔 (ms) */
function nextInterval(seenLength) {
  return pacingFor(seenLength).intervalMs;
}

module.exports = { pacingFor, takeChunk, nextInterval };
