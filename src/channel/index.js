'use strict';

/**
 * 渠道管理器 (统一入口)
 *
 * 按渠道类型实例化对应适配器, 对外暴露统一 API。
 * 飞书渠道保持原 API (getChannel/addReaction/streamReply 等), 供 index.js 消息流水线使用。
 * 其他渠道通过 getAdapter(type) 获取适配器实例。
 *
 * 渠道类型: feishu | telegram | dingtalk | slack | discord
 */

const { ChannelAdapter } = require('./base');
const { FeishuChannel } = require('./feishu');

// 渠道注册表 (懒加载, 避免未用渠道加载依赖)
const adapterRegistry = {
  feishu: () => require('./feishu').FeishuChannel,
  telegram: () => require('./telegram').TelegramAdapter,
  dingtalk: () => require('./dingtalk').DingTalkAdapter,
  slack: () => require('./slack').SlackAdapter,
  discord: () => require('./discord').DiscordAdapter,
};

// 实例缓存: key = `${type}:${accountId}`
const instances = new Map();

/**
 * 获取渠道适配器实例
 * @param {string} type 渠道类型
 * @param {object} config 配置
 * @param {string} accountId 账号 ID
 */
function getAdapter(type, config, accountId = 'default') {
  const key = `${type}:${accountId}`;
  if (instances.has(key)) return instances.get(key);
  const factory = adapterRegistry[type];
  if (!factory) throw new Error(`未知渠道类型: ${type}`);
  const Adapter = factory();
  const inst = new Adapter(config, accountId);
  instances.set(key, inst);
  return inst;
}

/** 列出所有已实例化的渠道 */
function listAdapters() {
  return [...instances.values()];
}

/** 获取所有渠道状态 (供状态页) */
function getAllStatus() {
  const list = [];
  for (const type of Object.keys(adapterRegistry)) {
    const inst = instances.get(`${type}:default`);
    if (inst) list.push(inst.getStatus());
  }
  // 未实例化渠道: 返回未连接占位
  for (const type of Object.keys(adapterRegistry)) {
    if (!instances.has(`${type}:default`)) {
      list.push({ channel: type, connected: false, online: 0, accounts: [], messageChannel: '—', lastChecked: null, health: '未配置' });
    }
  }
  return list;
}

// ---------- 飞书兼容 API (原 src/channel.js 导出) ----------

function getChannel(config, accountId) {
  return FeishuChannel.getRawChannel(config, accountId);
}

async function connect(config) {
  return FeishuChannel.connect(config);
}

async function addReaction(config, messageId, emoji = 'THINKING') {
  return FeishuChannel.addReaction(config, messageId, emoji);
}

async function removeReaction(config, messageId, emoji = 'THINKING') {
  return FeishuChannel.removeReaction(config, messageId, emoji);
}

async function streamReplyLive(config, chatId, replyTo, onChunk) {
  return FeishuChannel.streamReplyLive(config, chatId, replyTo, onChunk);
}

async function streamReply(config, chatId, replyTo, fullText) {
  return FeishuChannel.streamReply(config, chatId, replyTo, fullText);
}

async function sendText(config, chatId, text, opts = {}) {
  return FeishuChannel.sendText(config, chatId, text, opts);
}

async function sendMedia(config, chatId, media, opts = {}) {
  return FeishuChannel.sendMedia(config, chatId, media, opts);
}

async function appendCardFooter(config, messageId, bodyText, footerText) {
  return FeishuChannel.appendCardFooter(config, messageId, bodyText, footerText);
}

module.exports = {
  ChannelAdapter,
  getAdapter,
  listAdapters,
  getAllStatus,
  // 飞书兼容 API
  getChannel, connect, addReaction, removeReaction,
  streamReplyLive, streamReply, sendText, sendMedia, appendCardFooter,
};
