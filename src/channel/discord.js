'use strict';

/**
 * Discord 渠道适配器
 *
 * 接入方式: discord.com/developers 创建 App → Bot token → 邀请进服务器。
 * 参考 OpenClaw Discord 渠道 (official plugin)。
 *
 * 配置:
 *   DISCORD_BOT_TOKEN  — Bot token
 *
 * 说明: Gateway 接收需要 discord.js 依赖; 无依赖时降级为 REST 发送。
 */

const { ChannelAdapter } = require('./base');

const API = 'https://discord.com/api/v10';

class DiscordAdapter extends ChannelAdapter {
  static get type() { return 'discord'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.token = config.discordBotToken || process.env.DISCORD_BOT_TOKEN || '';
    this.messageChannel = 'Gateway (WebSocket)';
  }

  async _rest(method, path, body) {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${this.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error(`Discord ${method} ${path}: ${r.status} ${err.slice(0, 80)}`);
    }
    return r.json();
  }

  async connect() {
    if (!this.token) throw new Error('DISCORD_BOT_TOKEN 未配置');
    // 验证 token
    const me = await this._rest('GET', '/users/@me');
    this.botName = me.username || 'discord-bot';
    this.connected = true;
    this.lastChecked = new Date().toISOString();

    // Gateway 接收 (需 discord.js 依赖)
    try {
      const { Client, GatewayIntentBits } = require('discord.js');
      this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });
      this.client.on('messageCreate', (m) => {
        if (m.author.bot) return;
        this._handleMessage(m);
      });
      await this.client.login(this.token);
    } catch (e) {
      this.emit('error', new Error('Discord Gateway 需安装 discord.js: npm i discord.js (否则仅发送)'));
    }
  }

  _handleMessage(m) {
    const isGroup = !!m.guildId;
    const normalized = {
      messageId: m.id,
      chatId: isGroup ? m.channelId : m.channelId, // DM 用 channelId
      chatType: isGroup ? 'group' : 'p2p',
      senderId: m.author.id,
      senderName: m.author.username,
      text: m.content || '',
      mentionedBot: isGroup ? m.mentions?.has(this.client?.user?.id) : true,
      mentionAll: m.mentions?.everyone || false,
      threadId: undefined,
      rawContentType: m.attachments?.size ? 'file' : 'text',
      resources: m.attachments?.map((a) => ({ fileKey: a.id, type: 'file' })) || [],
    };
    this.emit('message', normalized);
  }

  async sendText(chatId, text, opts = {}) {
    const r = await this._rest('POST', `/channels/${chatId}/messages`, {
      content: text,
      message_reference: opts.replyTo ? { message_id: opts.replyTo } : undefined,
    });
    return { messageId: r.id };
  }

  async streamReplyLive(chatId, replyTo, onChunk) {
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
      const r = await this._rest('POST', `/channels/${chatId}/messages`, { content: media.url });
      return { messageId: r.id };
    }
    throw new Error('Discord sendMedia: 仅支持 URL');
  }

  async disconnect() {
    this.connected = false;
    try { await this.client?.destroy(); } catch (e) {}
  }
}

module.exports = { DiscordAdapter };
