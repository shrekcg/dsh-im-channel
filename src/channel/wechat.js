'use strict';

/**
 * 微信渠道适配器 (实验性)
 *
 * ⚠️ 注意: 微信个人号无官方 Bot API。接入方式为非官方协议 (wxauto/wechaty/padlocal),
 * 有账号风控风险。OpenClaw 通过外部插件 openclaw-weixin (腾讯维护) 支持。
 *
 * 配置:
 *   WECHAT_TYPE  — 'official' (公众号/服务号) | 'personal' (个人号, 实验)
 *
 * 当前实现: 骨架 + 配置检测 + 明确风险标注。
 * 真实接入建议使用 wechaty (个人号扫码登录) 或公众号官方 API。
 */

const { ChannelAdapter } = require('./base');

class WeChatAdapter extends ChannelAdapter {
  static get type() { return 'wechat'; }

  constructor(config, accountId) {
    super(config, accountId);
    this.mode = config.wechatMode || process.env.WECHAT_MODE || 'personal';
    this.messageChannel = '个人号协议 (实验)';
  }

  async connect() {
    if (this.mode === 'personal') {
      // 个人号: 需 wechaty 依赖 + 扫码登录 (非官方, 有风控风险)
      try {
        const { WechatyBuilder } = require('wechaty');
        this.bot = WechatyBuilder.build();
        this.bot.on('scan', (qrcode) => {
          // 扫码登录 (qrcode 为字符串, 可生成二维码)
          this.emit('error', new Error(`微信扫码: 用微信扫描登录 (qr: ${qrcode.slice(0, 20)}...)`));
        });
        this.bot.on('message', (m) => {
          const normalized = {
            messageId: m.id,
            chatId: m.room() ? m.room().id : m.talker().id,
            chatType: m.room() ? 'group' : 'p2p',
            senderId: m.talker().id,
            senderName: m.talker().name() || '',
            text: m.text() || '',
            mentionedBot: m.room() ? m.text().includes('@') : true,
            mentionAll: false,
            threadId: undefined,
            rawContentType: m.type() === 6 ? 'image' : 'text',
            resources: [],
          };
          this.emit('message', normalized);
        });
        await this.bot.start();
        this.connected = true;
      } catch (e) {
        throw new Error('微信个人号需安装 wechaty: npm i wechaty (⚠️ 非官方协议有风控风险)');
      }
    } else {
      throw new Error('微信公众号模式: 需配置 appId/appSecret (官方 API, 见文档)');
    }
    this.lastChecked = new Date().toISOString();
  }

  async sendText(chatId, text, opts = {}) {
    if (!this.bot) throw new Error('微信未连接');
    await this.bot.say(text);
    return { messageId: String(Date.now()) };
  }

  async disconnect() {
    this.connected = false;
    try { await this.bot?.stop(); } catch (e) {}
  }
}

module.exports = { WeChatAdapter };
