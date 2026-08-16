'use strict';

/**
 * WhatsApp 渠道适配器 (实验性)
 *
 * 接入方式: 官方 Cloud API (Meta) 需企业审核 + 域名验证 + Webhook;
 * 或非官方 whatsapp-web.js (个人号扫码, 有风控风险)。
 *
 * 配置:
 *   WHATSAPP_MODE  — 'cloud' (官方 Cloud API) | 'web' (whatsapp-web.js 个人号)
 *   WHATSAPP_TOKEN — Cloud API token (cloud 模式)
 *   WHATSAPP_PHONE — 业务号码 (cloud 模式)
 *
 * 当前实现: 骨架 + Cloud API 发送 (可测) + web 模式提示。
 */

const { ChannelAdapter } = require('./base');

class WhatsAppAdapter extends ChannelAdapter {
  static get type() { return 'whatsapp'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.mode = config.whatsappMode || process.env.WHATSAPP_MODE || 'cloud';
    this.token = config.whatsappToken || process.env.WHATSAPP_TOKEN || '';
    this.phone = config.whatsappPhone || process.env.WHATSAPP_PHONE || '';
    this.messageChannel = 'Cloud API (Webhook) / Web.js (个人号)';
  }

  async connect() {
    if (this.mode === 'cloud') {
      if (!this.token || !this.phone) throw new Error('WHATSAPP_TOKEN/PHONE 未配置 (Cloud API)');
      this.connected = true;
      // Cloud API 接收需 Webhook (公网地址), 无法纯长连接; 提示配置
      this.emit('error', new Error('WhatsApp Cloud API 接收需配置 Webhook 回调地址 (见 docs)'));
    } else {
      // whatsapp-web.js 个人号扫码 (非官方)
      try {
        const { Client } = require('whatsapp-web.js');
        this.client = new Client();
        this.client.on('qr', (qr) => this.emit('error', new Error(`WhatsApp 扫码: 用手机扫码 (qr: ${qr.slice(0, 20)}...)`)));
        this.client.on('message', (m) => {
          const normalized = {
            messageId: m.id.id,
            chatId: m.from,
            chatType: m.from.includes('@g.us') ? 'group' : 'p2p',
            senderId: m.author || m.from,
            senderName: m._data?.notifyName || '',
            text: m.body || '',
            mentionedBot: false,
            mentionAll: false,
            threadId: undefined,
            rawContentType: m.hasMedia ? 'file' : 'text',
            resources: [],
          };
          this.emit('message', normalized);
        });
        await this.client.initialize();
        this.connected = true;
      } catch (e) {
        throw new Error('WhatsApp web 模式需安装 whatsapp-web.js: npm i whatsapp-web.js (⚠️ 非官方有风控风险)');
      }
    }
    this.lastChecked = new Date().toISOString();
  }

  async sendText(chatId, text, opts = {}) {
    if (this.mode === 'cloud') {
      const r = await fetch(`https://graph.facebook.com/v19.0/${this.phone}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: chatId, type: 'text', text: { body: text } }),
      });
      if (!r.ok) throw new Error(`WhatsApp 发送失败: ${r.status}`);
      return { messageId: String(Date.now()) };
    }
    if (this.client) {
      await this.client.sendMessage(chatId, text);
      return { messageId: String(Date.now()) };
    }
    throw new Error('WhatsApp 未连接');
  }

  async disconnect() {
    this.connected = false;
    try { await this.client?.destroy(); } catch (e) {}
  }
}

module.exports = { WhatsAppAdapter };
