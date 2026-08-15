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
 *
 * 注意: SDK downloadResource/downloadResourceToFile 的 ResourceType 只支持
 * 'image' | 'file' (飞书 messageResource API 用 file 取所有附件类型),
 * 语音/视频统一按 'file' 下载, 再用响应 content-type 推断真实扩展名。
 *
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
      // 统一按 'file' 下载 (SDK ResourceType 仅 image|file)
      const apiType = res.type === 'image' ? 'image' : 'file';
      const filename = `${sanitize(msg.messageId)}-${sanitize(res.fileKey)}.media`;
      const localPath = path.join(dir, filename);
      // downloadResourceToFile 直接落盘 (避免大媒体占内存)
      const meta = await channel.downloadResourceToFile(msg.messageId, res.fileKey, apiType, localPath);
      // 用真实 content-type 推断扩展名, 重命名文件
      const realExt = extFromContentType(meta.contentType, res.type);
      if (realExt && !filename.endsWith(realExt)) {
        const finalPath = localPath.replace(/\.media$/, realExt);
        if (fs.existsSync(finalPath)) fs.rmSync(finalPath);
        fs.renameSync(localPath, finalPath);
        results.push({ ...res, localPath: finalPath, sizeBytes: meta.bytesWritten, contentType: meta.contentType });
      } else {
        results.push({ ...res, localPath, sizeBytes: meta.bytesWritten, contentType: meta.contentType });
      }
    } catch (e) {
      console.error(`[media] 下载失败 ${res.type} ${res.fileKey}:`, e.message);
    }
  }
  return results;
}

/** 根据 content-type 推断扩展名 (带兜底) */
function extFromContentType(contentType, fallbackType) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
    'image/bmp': '.bmp', 'image/svg+xml': '.svg',
    'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/opus': '.opus', 'audio/webm': '.webm',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
    'application/pdf': '.pdf', 'text/plain': '.txt', 'text/markdown': '.md',
    'application/json': '.json', 'application/zip': '.zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  if (contentType) {
    const base = contentType.split(';')[0].trim().toLowerCase();
    if (map[base]) return map[base];
  }
  // 兜底: 按资源类型给通用扩展名
  switch (fallbackType) {
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
