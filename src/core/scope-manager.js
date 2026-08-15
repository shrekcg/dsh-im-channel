'use strict';

/**
 * 权限管理 (对齐 OpenClaw scope-manager)
 *
 * 三层检查模型:
 *  1. Required Scopes: 工具所需权限 (手动维护, 见 toolScopes)
 *  2. App Granted: 应用在开放平台已开通的权限 (通过 API 查询)
 *  3. User Granted: 用户 OAuth 已授权的权限
 *
 * 功能:
 *  - checkMissingScopes(): 检测缺失权限
 *  - scopeApplyUrl(): 生成一键申请链接
 *  - applyScopes(): 尝试通过 scope apply API 申请 (bot 身份)
 */

const { spawn } = require('child_process');

const LARK_CLI = process.env.LARK_CLI || '/opt/homebrew/bin/lark-cli';

/** 工具所需的权限映射 (可扩展) */
const TOOL_SCOPES = {
  send_message: ['im:message', 'im:message:send_as_bot'],
  read_messages: ['im:message:readonly', 'im:message.p2p_msg:readonly'],
  get_user_info: ['contact:user.base:readonly'],
  read_document: ['docx:document:readonly'],
  create_document: ['docx:document:create', 'docx:document:write_only'],
  search_chats: ['im:chat:read'],
  get_chat_members: ['im:chat.members:read'],
  calendar_agenda: ['calendar:calendar:read', 'calendar:calendar.event:read'],
  create_calendar_event: ['calendar:calendar.event:create'],
  get_my_tasks: ['task:task:read'],
  create_task: ['task:task:write'],
  base_read_records: ['base:record:read'],
  sheets_read: ['sheets:spreadsheet:read'],
  wiki_search: ['wiki:node:read'],
  mail_list: ['mail:user_mailbox:readonly'],
  mail_send: ['mail:user_mailbox.message:send'],
  drive_search: ['drive:drive.metadata:readonly'],
  drive_list_folder: ['drive:drive.metadata:readonly'],
  minutes_search: ['minutes:minutes:readonly'],
  approval_list_todo: ['approval:instance:read'],
};

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => resolve({ code, out, err }));
    child.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
  });
}

/** 查询应用已开通的权限 (bot 身份) */
async function getAppGrantedScopes() {
  const res = await run(LARK_CLI, ['api', 'GET', '/open-apis/application/v6/scopes', '--as', 'bot']);
  try {
    const d = JSON.parse(res.out);
    if (d.ok === false) return { ok: false, error: d.error?.message || res.err };
    const scopes = (d.data && d.data.scopes) || [];
    return {
      ok: true,
      granted: scopes.filter((s) => s.grant_status === 1).map((s) => s.scope_name),
      all: scopes.map((s) => s.scope_name),
    };
  } catch (e) {
    return { ok: false, error: res.err || res.out };
  }
}

/** 检查工具所需权限的缺失情况 */
async function checkMissingScopes() {
  const app = await getAppGrantedScopes();
  if (!app.ok) return { ok: false, error: app.error };

  const missing = {};
  for (const [tool, scopes] of Object.entries(TOOL_SCOPES)) {
    const missingForTool = scopes.filter((s) => !app.granted.includes(s));
    if (missingForTool.length) missing[tool] = missingForTool;
  }
  return { ok: true, missing, granted: app.granted };
}

/** 生成一键权限申请链接 (scope-apply 页面) */
function scopeApplyUrl(appId, scopes) {
  const encoded = encodeURIComponent([...new Set(scopes)].join(','));
  return `https://open.feishu.cn/page/scope-apply?clientID=${appId}&scopes=${encoded}`;
}

module.exports = { checkMissingScopes, scopeApplyUrl, TOOL_SCOPES };
