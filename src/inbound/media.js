'use strict';

/**
 * 多媒体接收处理
 *
 * 支持从消息事件中解析并下载媒体资源 (图片/文件/音频/视频),
 * 保存到本地 media 目录, 供 DSH agent 使用。
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析消息中的媒体资源描述
 * SDK 的 NormalizedMessage.resources 格式:
 *   [{ messageId, fileKey, type: 'image'|'file'|'audio'|'video', localPath?, sizeBytes? }]
 */
function extractResources(msg) {
  return (msg.resources || []).map((r) => ({
    fileKey: r.fileKey,
    type: r.type,
    sizeBytes: r.sizeBytes,
    localPath: r.localPath,
  }));
}

/**
 * 下载消息媒体到本地目录
 * @param {object} channel SDK channel 实例
 * @param {object} msg 消息对象
 * @param {object} config 配置
 * @returns {Promise<Array<{fileKey, type, localPath, sizeBytes}>>}
 */
async function downloadMedia(channel, msg, config) {
  const resources = extractResources(msg);
  if (!resources.length) return [];

  const dir = config.mediaDir;
  fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (const res of resources) {
    try {
      // 已在本地 (SDK 自动下载) 则跳过
      if (res.localPath && fs.existsSync(res.localPath)) {
        results.push({ ...res, localPath: res.localPath });
        continue;
      }
      const buf = await channel.downloadResource(msg.messageId, res.fileKey, res.type);
      if (!buf || !buf.length) continue;

      const ext = extForType(res.type);
      const filename = `${sanitize(msg.messageId)}-${sanitize(res.fileKey)}${ext}`;
      const localPath = path.join(dir, filename);
      fs.writeFileSync(localPath, buf);
      results.push({ ...res, localPath, sizeBytes: buf.length });
    } catch (e) {
      console.error(`[media] 下载失败 ${res.type} ${res.fileKey}:`, e.message);
    }
  }
  return results;
}

function extForType(type) {
  switch (type) {
    case 'image': return '.img';
    case 'audio': return '.audio';
    case 'video': return '.video';
    default: return '.file';
  }
}

function sanitize(s) {
  return String(s || 'x').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40);
}

/**
 * 把媒体信息拼进发给 DSH 的 prompt
 * 图片: 友好描述 (不给二进制路径, 避免 agent 尝试读取困惑)
 * 文件: 给路径 (agent 可读取文本文件)
 */
function mediaToPromptText(mediaList) {
  if (!mediaList.length) return '';
  const lines = mediaList.map((m, i) => {
    const sizeKb = m.sizeBytes ? (m.sizeBytes / 1024).toFixed(1) + 'KB' : '未知大小';
    switch (m.type) {
      case 'image':
        return `  [图片${i + 1}] 用户发来一张图片 (${sizeKb}), 已保存: ${m.localPath}`;
      case 'audio':
        return `  [语音${i + 1}] 用户发来一段语音 (${sizeKb}), 已保存: ${m.localPath}`;
      case 'video':
        return `  [视频${i + 1}] 用户发来一段视频 (${sizeKb}), 已保存: ${m.localPath}`;
      default:
        return `  [文件${i + 1}] 用户发来一个文件 (${sizeKb}), 已保存: ${m.localPath}`;
    }
  });
  return '\n【消息附带媒体】\n' + lines.join('\n');
}

module.exports = { extractResources, downloadMedia, mediaToPromptText };
