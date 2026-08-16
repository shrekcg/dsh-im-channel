'use strict';

/**
 * 钉钉渠道适配器
 *
 * 接入方式: 钉钉开放平台创建机器人 (Stream 模式), 拿 appKey/appSecret。
 * 参考 OpenClaw 渠道架构 + 钉钉官方 Stream 模式 (outgoing 长连接, 无需公网回调)。
 *
 * 配置:
 *   DINGTALK_APP_KEY     — 应用 AppKey
 *   DINGTALK_APP_SECRET  — 应用 AppSecret
 *   DINGTALK_ROBOT_CODE  — 机器人编码 (可选)
 *
 * 注意: 钉钉 Stream 模式需要 @alicloud/dingtalk-stream 或原生 WebSocket 实现。
 * 当前实现基于钉钉开放 API (获取 access_token + 长连接端点), 简化版。
 */

const { ChannelAdapter } = require('./base');

class DingTalkAdapter extends ChannelAdapter {
  static get type() { return 'dingtalk'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.appKey = config.dingtalkAppKey || process.env.DINGTALK_APP_KEY || '';
    this.appSecret = config.dingtalkAppSecret || process.env.DINGTALK_APP_SECRET || '';
    this.robotCode = config.dingtalkRobotCode || process.env.DINGTALK_ROBOT_CODE || '';
    this.token = '';
    this.messageChannel = 'Stream 长连接 (outgoing)';
  }

  async _getToken() {
    if (this.token) return this.token;
    const r = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: this.appKey, appSecret: this.appSecret }),
    });
    const d = await r.json();
    if (!d.accessToken) throw new Error('钉钉获取 token 失败');
    this.token = d.accessToken;
    return this.token;
  }

  async connect() {
    if (!this.appKey || !this.appSecret) throw new Error('DINGTALK_APP_KEY/SECRET 未配置');
    await this._getToken();
    this.connected = true;
    this.lastChecked = new Date().toISOString();
    // 钉钉 Stream 模式: 建立 WebSocket 长连接接收消息
    // 简化: 使用轮询/API 拉取 (完整 Stream 需 @alicloud/dingtalk-stream 依赖)
    this.polling = true;
    this._poll().catch((e) => this.emit('error', e));
  }

  async _poll() {
    // 钉钉无公开的"拉取机器人消息"API; Stream 模式是 WebSocket 推送。
    // 此处保留轮询占位, 实际接入需安装 @alicloud/dingtalk-stream:
    //   const { StreamClient } = require('@alicloud/dingtalk-stream');
    //   const client = new StreamClient({ credential: { clientId: appKey, clientSecret: appSecret } });
    //   client.registerCallback('/v1.0/im/bot/messages/get', (msg) => this._handleMessage(msg));
    //   await client.start();
    this.emit('error', new Error('钉钉 Stream 需 @alicloud/dingtalk-stream 依赖 (npm install 后启用完整模式)'));
  }

  _handleMessage(data) {
    const text = data.text?.content || '';
    const normalized = {
      messageId: String(data.messageId || Date.now()),
      chatId: String(data.conversationId || ''),
      chatType: data.conversationType === '2' ? 'group' : 'p2p',
      senderId: String(data.senderStaffId || data.senderId || ''),
      senderName: data.senderNick || '',
      text,
      mentionedBot: true,
      mentionAll: false,
      threadId: undefined,
      rawContentType: 'text',
      resources: [],
    };
    this.emit('message', normalized);
  }

  async sendText(chatId, text, opts = {}) {
    const token = await this._getToken();
    const r = await fetch('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-acs-dingtalk-access-token': token },
      body: JSON.stringify({
        robotCode: this.robotCode,
        userIds: opts.replyTo ? [String(opts.replyTo)] : [chatId],
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: text }),
      }),
    });
    if (!r.ok) throw new Error(`钉钉发送失败: ${r.status}`);
    return { messageId: String(Date.now()) };
  }

  async sendMedia(chatId, media, opts = {}) {
    throw new Error('钉钉 sendMedia: 需配置媒体上传 (imageUrl)');
  }

  async disconnect() {
    this.polling = false;
    this.connected = false;
  }
}

module.exports = { DingTalkAdapter };
