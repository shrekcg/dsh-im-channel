'use strict';

/**
 * Slack 渠道适配器
 *
 * 接入方式: api.slack.com 创建 App → Socket Mode + Bot Token。
 * 参考 OpenClaw Slack 渠道 (official plugin, Socket Mode 默认)。
 *
 * 配置:
 *   SLACK_BOT_TOKEN  — Bot User OAuth Token (xoxb-)
 *   SLACK_APP_TOKEN  — App-Level Token (xapp-, Socket Mode 用)
 *
 * 说明: Socket Mode 接收需要 @slack/socket-mode + @slack/web-api 依赖;
 * 无依赖时自动降级为仅发送 (Web API), 并提示安装依赖。
 */

const { ChannelAdapter } = require('./base');

class SlackAdapter extends ChannelAdapter {
  static get type() { return 'slack'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.botToken = config.slackBotToken || process.env.SLACK_BOT_TOKEN || '';
    this.appToken = config.slackAppToken || process.env.SLACK_APP_TOKEN || '';
    this.messageChannel = 'Socket Mode (长连接)';
  }

  async _web(method, params = {}) {
    const r = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.botToken}` },
      body: JSON.stringify(params),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(`Slack ${method}: ${d.error || 'error'}`);
    return d;
  }

  async connect() {
    if (!this.botToken) throw new Error('SLACK_BOT_TOKEN 未配置');
    // 验证 token
    const auth = await this._web('auth.test');
    this.botName = auth.user || 'slack-bot';
    this.botUserId = auth.user_id || ''; // Slack mention 用用户 ID (<@U12345>), 不是 username
    this.connected = true;
    this.lastChecked = new Date().toISOString();

    // Socket Mode 接收 (需 @slack/socket-mode 依赖)
    if (this.appToken) {
      try {
        const { SocketModeClient } = require('@slack/socket-mode');
        this.socketClient = new SocketModeClient({ appToken: this.appToken, token: this.botToken });
        this.socketClient.on('message', async (event) => {
          if (event.type === 'events_api') {
            const payload = event.payload;
            if (payload.type === 'message' && payload.event?.type === 'message' && !payload.event.bot_id) {
              this._handleMessage(payload.event);
            }
          }
        });
        await this.socketClient.start();
      } catch (e) {
        this.emit('error', new Error('Slack Socket Mode 需安装 @slack/socket-mode: npm i @slack/socket-mode @slack/web-api'));
      }
    }
  }

  _handleMessage(m) {
    const isGroup = m.channel_type === 'channel' || m.channel_type === 'group';
    const text = m.text || '';
    const normalized = {
      messageId: String(m.ts || Date.now()),
      chatId: m.channel,
      chatType: isGroup ? 'group' : 'p2p',
      senderId: m.user || '',
      senderName: m.user || '',
      text,
      mentionedBot: isGroup ? text.includes(`<@${this.botUserId || this.botName}>`) || text.startsWith('/') : true,
      mentionAll: text.includes('<!channel>') || text.includes('<!everyone>'),
      threadId: m.thread_ts || undefined,
      rawContentType: m.files?.length ? 'file' : 'text',
      resources: m.files?.map((f) => ({ fileKey: f.id, type: 'file' })) || [],
    };
    this.emit('message', normalized);
  }

  async sendText(chatId, text, opts = {}) {
    const r = await this._web('chat.postMessage', {
      channel: chatId,
      text,
      thread_ts: opts.replyTo || undefined,
      mrkdwn: true,
    });
    return { messageId: r.ts };
  }

  async streamReplyLive(chatId, replyTo, onChunk) {
    // Slack 无流式编辑, 降级: 收集后发送
    let full = '';
    while (true) {
      const chunk = await onChunk();
      if (!chunk) break;
      full += chunk;
    }
    return this.sendText(chatId, full, { replyTo });
  }

  async sendMedia(chatId, media, opts = {}) {
    if (media.url) {
      const r = await this._web('chat.postMessage', { channel: chatId, text: media.url });
      return { messageId: r.ts };
    }
    throw new Error('Slack sendMedia: 仅支持 URL');
  }

  async disconnect() {
    this.connected = false;
    try { await this.socketClient?.disconnect(); } catch (e) {}
  }
}

module.exports = { SlackAdapter };
