'use strict';

/**
 * QQ 渠道适配器
 *
 * 接入方式: q.qq.com 开放平台扫码登录 → 创建 Bot → 复制 AppID/AppSecret。
 * 参考 OpenClaw QQ 渠道 (official plugin, 官方 Bot API WebSocket gateway)。
 *
 * 配置:
 *   QQ_APP_ID      — Bot AppID
 *   QQ_APP_SECRET  — Bot AppSecret
 *
 * 说明: 官方 Bot API 需 WebSocket Gateway (wss://api.sgroup.qq.com), 
 * 完整接收需 @qq-bot/sdk 或原生 ws; 当前实现 REST 发送 + SDK 可选接收。
 */

const { ChannelAdapter } = require('./base');

class QQAdapter extends ChannelAdapter {
  static get type() { return 'qq'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.appId = config.qqAppId || process.env.QQ_APP_ID || '';
    this.appSecret = config.qqAppSecret || process.env.QQ_APP_SECRET || '';
    this.messageChannel = 'WebSocket Gateway';
  }

  async _getToken() {
    if (this.token) return this.token;
    const r = await fetch('https://bots.qq.com/app/getAppAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.appId, clientSecret: this.appSecret }),
    });
    const d = await r.json();
    if (!d.access_token) throw new Error('QQ 获取 token 失败');
    this.token = d.access_token;
    return this.token;
  }

  async connect() {
    if (!this.appId || !this.appSecret) throw new Error('QQ_APP_ID/SECRET 未配置');
    await this._getToken();
    this.connected = true;
    this.lastChecked = new Date().toISOString();
    // 完整 Gateway 接收需 @qq-bot/sdk; 简化提示
    this.emit('error', new Error('QQ Gateway 接收需安装 @qq-bot/sdk (当前仅支持发送)'));
  }

  async sendText(chatId, text, opts = {}) {
    const token = await this._getToken();
    const r = await fetch(`https://api.sgroup.qq.com/v2/users/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `QQBot ${token}` },
      body: JSON.stringify({ content: text, msg_type: 0 }),
    });
    if (!r.ok) throw new Error(`QQ 发送失败: ${r.status}`);
    const d = await r.json();
    return { messageId: String(d.id || Date.now()) };
  }

  async sendMedia(chatId, media, opts = {}) {
    throw new Error('QQ sendMedia: 需上传媒体资源');
  }

  async disconnect() {
    this.connected = false;
  }
}

module.exports = { QQAdapter };
