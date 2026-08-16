'use strict';

/**
 * 渠道状态管理
 *
 * 收集 bridge 运行时状态, 供 HTTP 状态页 / JSON 接口查询。
 * 设计为可扩展: 目前只有 feishu, 未来可加 dingtalk/qq/wechat。
 *
 * 状态字段 (对齐 DSH IM 机器人页):
 *   channel      渠道名
 *   connected    是否已连接
 *   online       在线账号数
 *   accounts     账号列表 [{id, name, status, messageChannel, lastChecked, health}]
 *   messageChannel 消息通道 (WebSocket 长连接)
 *   lastChecked   最近检查时间
 *   health        健康描述
 */

const os = require('os');

// 运行时状态 (由 index.js 更新)
const state = {
  feishu: {
    channel: 'feishu',
    connected: false,
    online: 0,
    accounts: [],
    messageChannel: 'WebSocket 长连接',
    lastChecked: null,
    health: '未连接',
    botName: '',
    botOpenId: '',
    appId: process.env.LARK_APP_ID || '',
    startedAt: Date.now(),
    lastMessageAt: null,
  },
};

/**
 * 更新飞书渠道状态 (由 index.js 在连接/消息事件时调用)
 */
function updateFeishu(partial) {
  Object.assign(state.feishu, partial);
  state.feishu.lastChecked = new Date().toISOString();
  // 健康描述
  state.feishu.health = state.feishu.connected
    ? '飞书 WebSocket 长连接运行正常'
    : '未连接 (检查 launchd 服务)';
  state.feishu.online = state.feishu.connected ? Math.max(1, state.feishu.accounts.length) : 0;
  // 账号列表 (bot 身份)
  if (state.feishu.botName) {
    state.feishu.accounts = [{
      id: state.feishu.botOpenId || state.feishu.appId,
      name: state.feishu.botName,
      status: state.feishu.connected ? '运行正常' : '离线',
      messageChannel: state.feishu.messageChannel,
      lastChecked: state.feishu.lastChecked,
      health: state.feishu.health,
    }];
  }
}

/** 记录最近消息时间 */
function noteMessage() {
  state.feishu.lastMessageAt = new Date().toISOString();
}

/**
 * 获取完整状态 (JSON)
 * 返回 { channels: [...], feishu: {...} } 结构
 */
function getStatus() {
  const f = state.feishu;
  const uptime = Math.floor((Date.now() - f.startedAt) / 1000);
  const uptimeText = uptime < 60 ? `${uptime}s`
    : uptime < 3600 ? `${Math.floor(uptime / 60)}m${uptime % 60}s`
    : `${Math.floor(uptime / 3600)}h${Math.floor((uptime % 3600) / 60)}m`;

  return {
    channels: [
      { id: 'feishu', name: '飞书', icon: '📘', connected: f.connected, current: true },
      // 预留: 未来渠道
      { id: 'dingtalk', name: '钉钉', icon: '📱', connected: false, current: false },
      { id: 'qq', name: 'QQ', icon: '🐧', connected: false, current: false },
      { id: 'wechat', name: '微信', icon: '💬', connected: false, current: false },
    ],
    feishu: {
      ...f,
      uptimeText,
      hostname: os.hostname(),
      pid: process.pid,
    },
    serverTime: new Date().toISOString(),
  };
}

module.exports = { state, updateFeishu, noteMessage, getStatus };
