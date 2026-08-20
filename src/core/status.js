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

  // 渠道引导信息 (平台链接/凭据/步骤, 供设置页直接配置入口)
  let channelGuides = {};
  try {
    const { CHANNELS } = require('../commands/channels');
    channelGuides = CHANNELS;
  } catch (e) {}

  const channels = all.map((c) => {
    const guide = channelGuides[c.channel] || {};
    // 飞书连接状态以 feishuState 为准 (index.js 实时更新), 其他渠道用适配器状态
    const connected = c.channel === 'feishu' ? feishuState.connected : c.connected;
    return {
      id: c.channel,
      name: CHANNEL_NAMES[c.channel] || c.channel,
      icon: CHANNEL_ICONS[c.channel] || '📡',
      connected,
      current: c.channel === 'feishu',
      // 配置入口信息
      platform: guide.platform || '',
      credential: guide.credential || [],
      steps: guide.steps || [],
      env: guide.env || [],
      difficulty: guide.difficulty || '',
      note: guide.note || '',
    };
  });

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
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
};

const CHANNEL_ICONS = {
  feishu: '📘',
  dingtalk: '📱',
  slack: '🟣',
  telegram: '✈️',
  discord: '🎮',
};

// ---------- 兼容旧 API (index.js 仍调用) ----------

// 飞书运行时状态 (由 index.js 连接/消息时更新)
const feishuState = {
  connected: false,
  online: 0,
  accounts: [],       // 多账号累计 (按 appId 去重)
  botName: '',
  botOpenId: '',
  appId: '',
  lastMessageAt: null,
};
// 多账号注册表: appId -> bot 信息 (防单例被后连账号覆盖)
const feishuAccounts = new Map();

/** 更新飞书渠道状态 (兼容旧调用, 多账号时按 appId 累计) */
function updateFeishu(partial) {
  const prevAppId = feishuState.appId;
  Object.assign(feishuState, partial);
  feishuState.lastChecked = new Date().toISOString();
  feishuState.health = feishuState.connected ? '飞书 WebSocket 长连接运行正常' : '未连接 (检查 launchd 服务)';
  feishuState.online = feishuState.connected ? Math.max(1, feishuAccounts.size) : 0;
  // 多账号: 按 appId 注册/更新, 不去重时旧账号覆盖
  if (partial.botName && (partial.appId || prevAppId)) {
    const key = partial.appId || prevAppId;
    feishuAccounts.set(key, {
      id: partial.botOpenId || partial.appId || key,
      name: partial.botName,
      status: partial.connected ? '运行正常' : '离线',
      messageChannel: 'WebSocket 长连接',
      lastChecked: feishuState.lastChecked,
      health: feishuState.health,
    });
    feishuState.accounts = [...feishuAccounts.values()];
  }
  if (feishuState.botName && feishuAccounts.size === 0) {
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

module.exports = { getStatus, updateFeishu, noteMessage, feishuState, startedAt };
