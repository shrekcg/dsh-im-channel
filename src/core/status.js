'use strict';

/**
 * 渠道状态管理 (多渠道版)
 *
 * 汇总所有渠道适配器的状态, 供 HTTP 状态页 / JSON 接口 / DSH 设置页 tab 查询。
 * 渠道状态来自 channel-manager 的 getAllStatus()。
 */

const os = require('os');

// 全局启动时间
const startedAt = Date.now();

/**
 * 更新单个渠道状态 (由 index.js 在连接/消息时调用, 委托给适配器)
 * @param {string} type 渠道类型
 * @param {object} partial 状态片段
 */
function updateChannel(type, partial) {
  try {
    const { getAdapter } = require('../channel');
    const inst = getAdapter(type, { appId: '', appSecret: '' });
    if (inst && partial) {
      inst.connected = partial.connected ?? inst.connected;
      inst.botName = partial.botName ?? inst.botName;
      inst.lastChecked = new Date().toISOString();
    }
  } catch (e) {}
}

/**
 * 获取完整状态 (JSON)
 * 返回 { channels: [...], serverTime } 结构, 每个渠道一个状态对象
 */
function getStatus() {
  const { getAllStatus } = require('../channel');
  const all = getAllStatus();
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  const uptimeText = uptime < 60 ? `${uptime}s`
    : uptime < 3600 ? `${Math.floor(uptime / 60)}m${uptime % 60}s`
    : `${Math.floor(uptime / 3600)}h${Math.floor((uptime % 3600) / 60)}m`;

  const channels = all.map((c) => ({
    id: c.channel,
    name: CHANNEL_NAMES[c.channel] || c.channel,
    icon: CHANNEL_ICONS[c.channel] || '📡',
    connected: c.connected,
    current: c.channel === 'feishu',
  }));

  // 飞书详情保持兼容 (feishu 字段, 来自 feishuState)
  const feishu = { ...feishuState };

  return {
    channels,
    feishu: {
      ...feishu,
      uptimeText,
      hostname: os.hostname(),
      pid: process.pid,
      startedAt: new Date(startedAt).toISOString(),
    },
    all: all.map((c) => ({ ...c, uptimeText })),
    serverTime: new Date().toISOString(),
  };
}

const CHANNEL_NAMES = {
  feishu: '飞书',
  dingtalk: '钉钉',
  qq: 'QQ',
  wechat: '微信',
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
};

const CHANNEL_ICONS = {
  feishu: '📘',
  dingtalk: '📱',
  qq: '🐧',
  wechat: '💬',
  slack: '🟣',
  telegram: '✈️',
  discord: '🎮',
  whatsapp: '🟢',
};

// ---------- 兼容旧 API (index.js 仍调用) ----------

// 飞书运行时状态 (由 index.js 连接/消息时更新)
const feishuState = {
  connected: false,
  online: 0,
  accounts: [],
  botName: '',
  botOpenId: '',
  appId: '',
  lastMessageAt: null,
};

/** 更新飞书渠道状态 (兼容旧调用) */
function updateFeishu(partial) {
  Object.assign(feishuState, partial);
  feishuState.lastChecked = new Date().toISOString();
  feishuState.health = feishuState.connected ? '飞书 WebSocket 长连接运行正常' : '未连接 (检查 launchd 服务)';
  feishuState.online = feishuState.connected ? 1 : 0;
  if (feishuState.botName) {
    feishuState.accounts = [{
      id: feishuState.botOpenId || feishuState.appId,
      name: feishuState.botName,
      status: feishuState.connected ? '运行正常' : '离线',
      messageChannel: 'WebSocket 长连接',
      lastChecked: feishuState.lastChecked,
      health: feishuState.health,
    }];
  }
}

/** 记录最近消息时间 (兼容旧调用) */
function noteMessage() {
  feishuState.lastMessageAt = new Date().toISOString();
}

module.exports = { getStatus, updateChannel, updateFeishu, noteMessage, feishuState, startedAt };
