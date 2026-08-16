'use strict';

/**
 * 渠道适配器统一接口 (base)
 *
 * 每个渠道实现以下方法, 由 channel-manager 统一调度。
 * 对齐 OpenClaw Gateway 的 channel 抽象思路。
 *
 * 统一消息结构 (各渠道原生消息 → 归一化):
 *   {
 *     messageId,        // 渠道消息 ID
 *     chatId,           // 会话 ID (渠道内唯一)
 *     chatType,         // 'p2p' | 'group'
 *     senderId,         // 发送者 ID
 *     senderName,       // 发送者显示名 (可选)
 *     text,             // 文本内容
 *     mentionedBot,     // 是否 @ 了 bot
 *     mentionAll,       // 是否 @all
 *     threadId,         // 话题 ID (可选)
 *     rawContentType,   // 原始消息类型 (text/image/file/audio/video)
 *     resources,        // 媒体资源 [{fileKey, type, sizeBytes}]
 *   }
 */

class ChannelAdapter {
  constructor(config, accountId) {
    this.config = config;
    this.accountId = accountId;
    this.connected = false;
    this.handlers = {
      message: () => {},
      reaction: () => {},
      cardAction: () => {},
      comment: () => {},
      error: () => {},
      reconnecting: () => {},
      reconnected: () => {},
    };
  }

  /** 渠道类型标识 (feishu/telegram/dingtalk/slack/discord/qq/wechat/whatsapp) */
  static get type() { return 'base'; }

  /** 连接渠道 (长连接/轮询/WebSocket) */
  async connect() { throw new Error('connect() 未实现'); }

  /** 发送文本消息 (回复) */
  async sendText(chatId, text, opts = {}) { throw new Error('sendText() 未实现'); }

  /** 流式回复 (真流式, onChunk 生产-消费) */
  async streamReplyLive(chatId, replyTo, onChunk) {
    // 默认降级: 收集所有 chunk 后一次性发送
    let full = '';
    while (true) {
      const chunk = await onChunk();
      if (!chunk) break;
      full += chunk;
    }
    return this.sendText(chatId, full, { replyTo });
  }

  /** 发送媒体 */
  async sendMedia(chatId, media, opts = {}) { throw new Error('sendMedia() 未实现'); }

  /** 添加表情 */
  async addReaction(messageId, emoji) { /* 可选实现 */ }

  /** 移除表情 */
  async removeReaction(messageId, emoji) { /* 可选实现 */ }

  /** 下载媒体到本地 */
  async downloadMedia(msg, config) { return []; }

  /** 追加卡片 footer (可选) */
  async appendCardFooter(messageId, bodyText, footerText) { /* 可选 */ }

  /** 获取渠道状态 (供状态页) */
  getStatus() {
    return {
      channel: this.constructor.type,
      connected: this.connected,
      online: this.connected ? 1 : 0,
      accounts: this.connected ? [{
        id: this.config.appId || this.accountId,
        name: this.config.botName || this.constructor.type,
        status: '运行正常',
        messageChannel: this.messageChannel || '长连接',
        lastChecked: this.lastChecked || null,
        health: this.connected ? `${this.constructor.type} 连接运行正常` : '未连接',
      }] : [],
      messageChannel: this.messageChannel || '长连接',
      lastChecked: this.lastChecked,
      health: this.connected ? `${this.constructor.type} 连接运行正常` : '未连接',
    };
  }

  /** 内部: 触发事件 */
  emit(event, payload) {
    this.handlers[event]?.(payload);
  }

  /** 注册事件处理器 */
  on(event, handler) {
    this.handlers[event] = handler;
    return this;
  }

  /** 断开连接 */
  async disconnect() { this.connected = false; }
}

module.exports = { ChannelAdapter };
