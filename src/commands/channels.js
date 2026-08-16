'use strict';

/**
 * 渠道接入向导 (/channels add)
 *
 * 对齐 OpenClaw 的 `openclaw channels add` 思路:
 * 每个渠道给出: 登录链接/二维码 + 创建步骤 + 需要填入的凭据。
 *
 * 用法:
 *   /channels                 列出所有渠道及状态
 *   /channels add <channel>   查看该渠道的接入引导
 *   /channels add telegram    示例: Telegram 最快 (BotFather 聊天内创建)
 *
 * 注意: 各平台"扫码一键创建应用"均不支持 (平台安全限制),
 * 扫码可做到: 登录开放平台 + 部分渠道个人号扫码 (微信/WhatsApp 非官方)。
 */

const CHANNELS = {
  feishu: {
    name: '飞书',
    icon: '📘',
    difficulty: '⭐⭐',
    platform: 'https://open.feishu.cn/app',
    credential: ['App ID (cli_...)', 'App Secret'],
    steps: [
      '打开 https://open.feishu.cn/app 创建「企业自建应用」',
      '应用能力 → 启用【机器人】',
      '凭证与基础信息 → 复制 App ID / App Secret',
      '权限管理 → 添加 im:message / cardkit 等权限并发布',
    ],
    env: ['LARK_APP_ID', 'LARK_APP_SECRET'],
    note: '本渠道已集成, 直接可用',
  },
  telegram: {
    name: 'Telegram',
    icon: '✈️',
    difficulty: '⭐ (最简单)',
    platform: 'https://t.me/BotFather',
    credential: ['Bot Token'],
    steps: [
      '在 Telegram 搜索 @BotFather 并打开对话',
      '发送 /newbot, 按提示输入 bot 名称和 username',
      'BotFather 返回 Bot Token (形如 123456:ABC-DEF...)',
      '复制 Token 填入配置即可 (无需任何审批)',
    ],
    env: ['TELEGRAM_BOT_TOKEN'],
    note: 'BotFather 聊天内完成, 无需扫码/审批',
  },
  dingtalk: {
    name: '钉钉',
    icon: '📱',
    difficulty: '⭐⭐',
    platform: 'https://open.dingtalk.com',
    credential: ['AppKey', 'AppSecret', '机器人编码 (可选)'],
    steps: [
      '打开 https://open.dingtalk.com 扫码登录',
      '创建企业内部应用 → 添加机器人能力',
      '开发配置 → 选择 Stream 模式 (长连接, 无需公网回调)',
      '复制 AppKey / AppSecret 填入配置',
    ],
    env: ['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET'],
    note: 'Stream 模式与飞书架构最接近',
  },
  slack: {
    name: 'Slack',
    icon: '🟣',
    difficulty: '⭐⭐',
    platform: 'https://api.slack.com/apps',
    credential: ['Bot Token (xoxb-)', 'App Token (xapp-, Socket Mode)'],
    steps: [
      '打开 https://api.slack.com/apps → Create New App (From scratch)',
      'Add features → Bots → 添加 Bot User',
      'Socket Mode → Enable (拿 App-Level Token xapp-)',
      'OAuth & Permissions → Install to Workspace (拿 Bot Token xoxb-)',
      '邀请 bot 进频道, 填入两个 Token',
    ],
    env: ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'],
    note: 'Socket Mode 长连接, 无需公网 URL',
  },
  discord: {
    name: 'Discord',
    icon: '🎮',
    difficulty: '⭐⭐',
    platform: 'https://discord.com/developers/applications',
    credential: ['Bot Token'],
    steps: [
      '打开 https://discord.com/developers/applications → New Application',
      'Bot → Add Bot → Reset Token (复制 Bot Token)',
      'OAuth2 → URL Generator → 选 bot + Send Messages 权限 → 生成邀请链接',
      '用邀请链接把 bot 拉进服务器, 填入 Token',
    ],
    env: ['DISCORD_BOT_TOKEN'],
    note: '需要 discord.js 依赖做 Gateway 接收',
  },
  qq: {
    name: 'QQ',
    icon: '🐧',
    difficulty: '⭐⭐⭐',
    platform: 'https://q.qq.com',
    credential: ['AppID', 'AppSecret'],
    steps: [
      '打开 https://q.qq.com 用手机 QQ 扫码登录',
      '创建 Bot → 填写资料 → 获取 AppID / AppSecret',
      '配置消息接收 (WebSocket gateway)',
    ],
    env: ['QQ_APP_ID', 'QQ_APP_SECRET'],
    note: '官方 Bot API, 扫码登录平台但创建仍需手动',
  },
};

/** 列出所有渠道及状态 */
function listChannels() {
  const lines = ['**可用渠道**', ''];
  for (const [id, c] of Object.entries(CHANNELS)) {
    lines.push(`- ${c.icon} **${c.name}** — 难度 ${c.difficulty}${id === 'feishu' ? ' (已集成 ✅)' : ''}`);
  }
  lines.push('', '查看接入步骤: `/channels add <渠道名>` (如 `/channels add telegram`)');
  return lines.join('\n');
}

/** 查看单个渠道接入引导 */
function channelGuide(name) {
  // 匹配渠道 (支持中英文/别名)
  const match = Object.entries(CHANNELS).find(([id, c]) =>
    id === name.toLowerCase() || c.name.toLowerCase() === name.toLowerCase() || c.name === name
  );
  if (!match) {
    return `未知渠道 \`${name}\`。可用渠道: ${Object.keys(CHANNELS).join(', ')}`;
  }
  const [id, c] = match;
  const lines = [
    `${c.icon} **${c.name}** 接入引导 (难度 ${c.difficulty})`,
    '',
    `**平台**: ${c.platform}`,
    '',
    '**步骤**:',
  ];
  c.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('', '**需要配置的凭据**:');
  c.credential.forEach((cr) => lines.push(`- \`${cr}\``));
  lines.push('', '**环境变量**:');
  c.env.forEach((e) => lines.push(`- \`${e}\``));
  if (c.note) lines.push('', `> 💡 ${c.note}`);
  return lines.join('\n');
}

/**
 * 处理 /channels 命令
 * @returns {Promise<{handled: boolean, reply?: string}>}
 */
async function handleChannelsCommand(args) {
  const [sub, target] = args;
  if (!sub) return { handled: true, reply: listChannels() };
  if (sub === 'add' && target) return { handled: true, reply: channelGuide(target) };
  if (sub === 'add') return { handled: true, reply: '用法: `/channels add <渠道名>`\n\n' + listChannels() };
  return { handled: true, reply: channelGuide(sub) };
}

module.exports = { handleChannelsCommand, CHANNELS };
