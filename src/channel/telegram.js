'use strict';

/**
 * Telegram 渠道适配器
 *
 * 接入方式: BotFather 创建 bot 拿 token (聊天内完成, 无扫码), 官方 Bot API 长轮询。
 * 参考 OpenClaw Telegram 渠道 (bundled plugin, grammY 但核心是 getUpdates 长轮询)。
 *
 * 配置 (config.json accounts 或 env):
 *   TELEGRAM_BOT_TOKEN  — BotFather 给的 token
 *
 * 能力:
 *   - 私聊/群聊收发
 *   - 文本/图片
 *   - 真流式 (编辑消息实现打字机)
 */

const { ChannelAdapter } = require('./base');
const fs = require('fs');
const path = require('path');

const API = 'https://api.telegram.org/bot';

class TelegramAdapter extends ChannelAdapter {
  static get type() { return 'telegram'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.offset = 0;
    this.polling = false;
    this.messageChannel = 'Long Polling (getUpdates)';
  }

  get api() { return API + this.token; }

  async apiCall(method, params = {}) {
    const r = await fetch(`${this.api}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(`Telegram API ${method}: ${d.description || 'error'}`);
    return d.result;
  }

  async connect() {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN 未配置');
    // 验证 token
    const me = await this.apiCall('getMe');
    this.botName = me.username || 'telegram-bot';
    this.connected = true;
    this.lastChecked = new Date().toISOString();
    // 启动长轮询
    this.polling = true;
    this._poll().catch((e) => this.emit('error', e));
  }

  async _poll() {
    while (this.polling) {
      try {
        const updates = await this.apiCall('getUpdates', {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ['message'],
        });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.message) this._handleMessage(u.message);
        }
      } catch (e) {
        if (this.polling) {
          this.emit('error', e);
          await new Promise((r) => setTimeout(r, 3000)); // 错误退避
        }
      }
    }
  }

  _handleMessage(m) {
    const text = m.text || m.caption || '';
    const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup';
    this._lastChatId = String(m.chat.id); // 记录会话, 供 addReaction 使用
    const normalized = {
      messageId: String(m.message_id),
      chatId: String(m.chat.id),
      chatType: isGroup ? 'group' : 'p2p',
      senderId: String(m.from?.id || ''),
      senderName: m.from?.first_name || m.from?.username || '',
      text,
      mentionedBot: isGroup ? (text.includes('@' + (this.botName || '')) || text.startsWith('/')) : true,
      mentionAll: false,
      threadId: undefined,
      rawContentType: m.photo ? 'image' : (m.document ? 'file' : (m.voice ? 'audio' : 'text')),
      resources: m.photo ? [{ fileKey: String(m.photo[m.photo.length - 1].file_id), type: 'image' }]
        : m.document ? [{ fileKey: m.document.file_id, type: 'file' }]
        : m.voice ? [{ fileKey: m.voice.file_id, type: 'audio' }] : [],
    };
    this.emit('message', normalized);
  }

  async sendText(chatId, text, opts = {}) {
    try {
      const r = await this.apiCall('sendMessage', {
        chat_id: chatId,
        text,
        reply_to_message_id: opts.replyTo ? Number(opts.replyTo) : undefined,
        parse_mode: 'Markdown',
      });
      return { messageId: String(r.message_id) };
    } catch (e) {
      // Markdown 解析失败 (未配对 * _ [ ] 等) 时降级纯文本重试
      const r = await this.apiCall('sendMessage', {
        chat_id: chatId,
        text,
        reply_to_message_id: opts.replyTo ? Number(opts.replyTo) : undefined,
      });
      return { messageId: String(r.message_id) };
    }
  }

  /** 真流式: 用编辑消息模拟打字机 */
  async streamReplyLive(chatId, replyTo, onChunk) {
    // 先发占位, 然后逐步编辑
    let full = '';
    let msgId = null;
    while (true) {
      const chunk = await onChunk();
      if (!chunk) break;
      full += chunk;
      try {
        if (!msgId) {
          const r = await this.apiCall('sendMessage', { chat_id: chatId, text: full });
          msgId = r.message_id;
        } else {
          await this.apiCall('editMessageText', { chat_id: chatId, message_id: msgId, text: full, parse_mode: 'Markdown' });
        }
      } catch (e) { /* markdown 解析失败时忽略 */ }
    }
    return { messageId: msgId ? String(msgId) : null };
  }

  async sendMedia(chatId, media, opts = {}) {
    // 图片 URL 发送 (本地文件需 multipart, 简化为文档 URL)
    if (media.url) {
      const r = await this.apiCall('sendPhoto', { chat_id: chatId, photo: media.url });
      return { messageId: String(r.message_id) };
    }
    throw new Error('Telegram sendMedia: 仅支持 URL 媒体');
  }

  /** 下载媒体到本地 (供 agent 查看图片/文件) */
  async downloadMedia(msg, config) {
    const resources = msg.resources || [];
    if (!resources.length) return [];
    const dir = config.mediaDir;
    fs.mkdirSync(dir, { recursive: true });
    const results = [];
    for (const res of resources) {
      try {
        // getFile → file_path → 下载
        const f = await this.apiCall('getFile', { file_id: res.fileKey });
        const filePath = f.file_path;
        if (!filePath) continue;
        const ext = path.extname(filePath) || '.file';
        const localPath = path.join(dir, `${Date.now()}-${res.type}${ext}`);
        const dl = await fetch(`https://api.telegram.org/file/bot${this.token}/${filePath}`);
        if (!dl.ok) throw new Error('下载失败 ' + dl.status);
        const buf = Buffer.from(await dl.arrayBuffer());
        fs.writeFileSync(localPath, buf);
        results.push({ ...res, localPath, sizeBytes: buf.length });
      } catch (e) {
        console.error(`[telegram] 媒体下载失败 ${res.type}:`, e.message);
      }
    }
    return results;
  }

  async addReaction(messageId, emoji) {
    const map = { THINKING: '🤔' };
    try {
      await this.apiCall('setMessageReaction', {
        chat_id: this._lastChatId,
        message_id: Number(messageId),
        reaction: [{ type: 'emoji', emoji: map[emoji] || emoji }],
      });
    } catch (e) {}
  }

  async disconnect() {
    this.polling = false;
    this.connected = false;
  }
}

module.exports = { TelegramAdapter };
