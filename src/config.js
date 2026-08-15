'use strict';

/**
 * 配置管理模块
 *
 * 配置来源（优先级从高到低）:
 *  1. 环境变量 (launchd plist / shell)
 *  2. 配置文件 config.json (预留, 支持多账号等复杂配置)
 *  3. 默认值
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULTS = {
  appId: '',
  appSecret: '',                    // 必填
  dshBin: path.join(os.homedir(), '.local', 'bin', 'dsh'),
  dshHome: path.join(os.homedir(), '.dsh'),
  requireMention: false,            // 群聊是否要求 @ 才响应
  respondToMentionAll: true,
  typingChunkMs: 250,               // 卡片打字机每块间隔
  typingChunkSize: 8,               // 每块字符数
  dshTimeoutMs: 300000,             // DSH 处理超时
  mediaMaxMb: 20,                   // 媒体文件大小上限
  mediaDir: '',                     // 媒体下载目录 (默认项目内 media/)
  logLevel: 'info',
  showModel: '',                    // 回复 footer 是否显示模型名 (如 'deepseek-v4-flash')
  reactionNotifications: 'off',     // off | own | all (表情反馈)
  groupPolicy: 'open',              // open | allowlist | closed
  groupAllowFrom: [],               // 群聊白名单 (open_id 列表)
  dmPolicy: 'open',                 // open | allowlist | closed
  dmAllowFrom: [],                  // 私聊白名单
  allowBots: false,                 // bot-at-bot: false | true | 'mentions'
  groups: {},                       // 按群细粒度配置: { oc_xxx: { requireMention: true } }
  accounts: {},                     // 多账号预留: { accountId: { appId, appSecret, ... } }
};

/** 读取可选配置文件 config.json（若存在） */
function loadConfigFile(dir) {
  const p = path.join(dir, 'config.json');
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    console.error(`[config] 配置文件解析失败 ${p}: ${e.message}`);
  }
  return {};
}

/** 从环境变量读取配置 */
function loadFromEnv() {
  return {
    appId: process.env.LARK_APP_ID || '',
    appSecret: process.env.LARK_APP_SECRET || '',
    dshBin: process.env.DSH_BIN || '',
    dshHome: process.env.DSH_HOME || '',
    requireMention: process.env.REQUIRE_MENTION === 'true',
    respondToMentionAll: process.env.RESPOND_TO_MENTION_ALL !== 'false',
    typingChunkMs: parseInt(process.env.TYPING_CHUNK_MS || '', 10) || undefined,
    typingChunkSize: parseInt(process.env.TYPING_CHUNK_SIZE || '', 10) || undefined,
    dshTimeoutMs: parseInt(process.env.DSH_TIMEOUT_MS || '', 10) || undefined,
    mediaMaxMb: parseInt(process.env.MEDIA_MAX_MB || '', 10) || undefined,
    mediaDir: process.env.MEDIA_DIR || '',
    logLevel: process.env.BRIDGE_LOG_LEVEL || '',
    reactionNotifications: process.env.REACTION_NOTIFICATIONS || '',
    groupPolicy: process.env.GROUP_POLICY || '',
    groupAllowFrom: (process.env.GROUP_ALLOW_FROM || '').split(',').map((s) => s.trim()).filter(Boolean),
    dmAllowFrom: (process.env.DM_ALLOW_FROM || '').split(',').map((s) => s.trim()).filter(Boolean),
    allowBots: process.env.ALLOW_BOTS === 'true' ? true : process.env.ALLOW_BOTS === 'mentions' ? 'mentions' : undefined,
  };
}

/** 空字符串视为未设置, 回退 */
function cleanEmpty(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === '') obj[k] = undefined;
  }
  return obj;
}

/** 深合并 (后覆盖前) */
function merge(base, ...overrides) {
  const out = { ...base };
  for (const o of overrides) {
    if (!o) continue;
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = merge(out[k], v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

/** 组装最终配置 */
function loadConfig(dir) {
  const fileCfg = loadConfigFile(dir);
  const envCfg = cleanEmpty(loadFromEnv());
  // 优先级: config.json (用户显式配置, 如 setup 写入) > 环境变量 (launchd/部署兜底)
  // 避免"双真相源"问题: setup 写的 config.json 不被 launchd plist 的 env 遮蔽
  const config = merge(DEFAULTS, envCfg, fileCfg);

  // 派生路径
  config.dshBin = config.dshBin || path.join(os.homedir(), '.local', 'bin', 'dsh');
  config.dshHome = config.dshHome || path.join(os.homedir(), '.dsh');
  config.mediaDir = config.mediaDir || path.join(dir, 'media');
  config.larkSessionPatch = path.join(
    config.dshHome, 'profiles', 'headless', 'node_modules', 'dsh-lark-session', 'cordis.patch.yml'
  );

  // 多账号归一化: 顶层账号 = default 账号
  // accounts 结构: { accountId: { appId, appSecret, requireMention?, ... } }
  const accounts = {};
  if (config.appSecret) {
    accounts.default = {
      appId: config.appId,
      appSecret: config.appSecret,
      name: 'default',
    };
  }
  if (config.accounts && typeof config.accounts === 'object') {
    for (const [id, acc] of Object.entries(config.accounts)) {
      if (!acc || !acc.appSecret) continue;
      accounts[id] = {
        name: id,
        ...acc,
      };
    }
  }
  config.accounts = accounts;

  if (Object.keys(config.accounts).length === 0) {
    throw new Error('[config] 未配置任何飞书账号 (需 LARK_APP_SECRET 或 accounts)');
  }
  return config;
}

module.exports = { loadConfig, DEFAULTS };
