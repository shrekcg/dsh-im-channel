'use strict';

/**
 * 飞书 MCP Server (stdio)
 *
 * 通过 Model Context Protocol 向 DSH 暴露飞书对象操作能力,
 * 工具以 mcp__feishu__<name> 形式对 agent 可用。
 *
 * 执行后端: lark-cli (复用已验证的 CLI 能力)
 *
 * 启动: node src/tools/mcp-server.js
 * 连接: DSH dsh-mcp-client 插件 (transport: stdio, command: node, args: [mcp-server.js])
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { spawn } = require('child_process');

const LARK_CLI = process.env.LARK_CLI || '/opt/homebrew/bin/lark-cli';

// ---------- 工具 ----------
function runLark(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(LARK_CLI, args, {
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

async function larkJson(args, identity = 'bot') {
  const res = await runLark([...args, '--as', identity, '--json']);
  try {
    const d = JSON.parse(res.out);
    if (d.ok === false) return { ok: false, error: d.error?.message || res.err };
    return { ok: true, data: d.data || d };
  } catch (e) {
    return { ok: false, error: res.err || res.out };
  }
}

const server = new McpServer({
  name: 'feishu',
  version: '0.1.0',
});

// ---------- 消息工具 ----------

server.tool(
  'send_message',
  '发送飞书消息 (文本/富文本) 到指定会话或用户',
  {
    target: z.string().describe('接收者: chat_id (oc_开头) 或 user open_id (ou_开头)'),
    text: z.string().describe('消息文本内容'),
    as: z.enum(['bot', 'user']).optional().describe('发送身份, 默认 bot'),
  },
  async ({ target, text, as }) => {
    const isChat = target.startsWith('oc_');
    const args = ['im', '+messages-send'];
    if (isChat) args.push('--chat-id', target);
    else args.push('--user-id', target);
    args.push('--msg-type', 'text', '--content', JSON.stringify({ text }));
    const r = await larkJson(args, as || 'bot');
    return { content: [{ type: 'text', text: r.ok ? `已发送: ${r.data.message_id}` : `失败: ${r.error}` }] };
  }
);

server.tool(
  'read_messages',
  '读取飞书会话最近消息 (私聊或群聊)',
  {
    chat_id: z.string().describe('会话 ID (oc_开头)'),
    limit: z.number().min(1).max(50).optional().describe('消息条数, 默认 20'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ chat_id, limit, as }) => {
    const r = await larkJson(['im', '+chat-messages-list', '--chat-id', chat_id, '--page-size', String(limit || 20)], as || 'bot');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const msgs = (r.data.messages || r.data.items || []).map((m) => {
      const sender = m.sender?.sender_type || '?';
      let text = m.content || '';
      try { text = JSON.parse(text).text || text; } catch (e) {}
      return `[${sender}] ${String(text).slice(0, 100)}`;
    });
    return { content: [{ type: 'text', text: msgs.join('\n') || '(无消息)' }] };
  }
);

server.tool(
  'get_user_info',
  '按姓名或邮箱解析飞书用户 open_id',
  {
    name: z.string().describe('用户姓名或邮箱'),
  },
  async ({ name }) => {
    const r = await larkJson(['contact', '+search-user', '--query', name], 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const users = r.data.users || r.data.items || [];
    const lines = users.map((u) => `${u.name || u.english_name || ''}: ${u.open_id || u.user_id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

// ---------- 文档工具 ----------

server.tool(
  'read_document',
  '读取飞书云文档内容',
  {
    doc: z.string().describe('文档 URL 或 token'),
    format: z.enum(['markdown', 'xml']).optional().describe('输出格式, 默认 markdown'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ doc, format, as }) => {
    const r = await larkJson(['docs', '+fetch', '--doc', doc, '--doc-format', format || 'markdown'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const content = r.data.document?.content || '(空文档)';
    // 限制长度
    return { content: [{ type: 'text', text: String(content).slice(0, 4000) }] };
  }
);

server.tool(
  'create_document',
  '创建飞书云文档',
  {
    title: z.string().describe('文档标题'),
    content: z.string().describe('文档内容 (Markdown 或 XML)'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ title, content, as }) => {
    const r = await larkJson(['docs', '+create', '--title', title, '--content', content], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const doc = r.data.document || r.data;
    const docId = doc.document_id || doc.id || (doc.url || '').split('/').pop() || '';
    // 用标准域名拼接 URL (lark-cli 返回的 my.feishu.cn 可能导致客户端"离线模式")
    const url = docId ? `https://feishu.cn/docx/${docId}` : (doc.url || '');
    return { content: [{ type: 'text', text: `已创建文档: ${url}` }] };
  }
);

// ---------- 群/会话工具 ----------

server.tool(
  'search_chats',
  '搜索飞书群聊',
  {
    query: z.string().describe('群名关键词'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, as }) => {
    const r = await larkJson(['im', '+chat-search', '--query', query], as || 'bot');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const chats = r.data.chats || r.data.items || [];
    const lines = chats.map((c) => `${c.name}: ${c.chat_id || c.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

server.tool(
  'get_chat_members',
  '获取飞书群聊成员列表',
  {
    chat_id: z.string().describe('会话 ID (oc_开头)'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ chat_id, as }) => {
    const r = await larkJson(['im', '+chat-members-list', '--chat-id', chat_id], as || 'bot');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const users = r.data.users || r.data.members || [];
    const lines = users.map((u) => `${u.name || u.user_id || u.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无成员)' }] };
  }
);

// ---------- 日历工具 ----------

server.tool(
  'calendar_agenda',
  '查看飞书日历日程 (当天或指定日期)',
  {
    date: z.string().optional().describe('日期 YYYY-MM-DD, 默认今天'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ date, as }) => {
    const args = ['calendar', '+agenda'];
    if (date) args.push('--date', date);
    const r = await larkJson(args, as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.events || r.data.items || r.data;
    const text = typeof items === 'string' ? items : JSON.stringify(items).slice(0, 1500);
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'create_calendar_event',
  '创建飞书日历日程',
  {
    summary: z.string().describe('日程标题'),
    start: z.string().describe('开始时间, ISO 格式或 YYYY-MM-DD HH:mm'),
    end: z.string().optional().describe('结束时间, 默认 1 小时后'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ summary, start, end, as }) => {
    const r = await larkJson(['calendar', '+create', '--summary', summary, '--start', start, '--end', end || ''], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建日程: ${summary}` }] };
  }
);

// ---------- 任务工具 ----------

server.tool(
  'get_my_tasks',
  '获取我的飞书任务列表',
  {
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ as }) => {
    const r = await larkJson(['task', '+get-my-tasks'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const tasks = r.data.tasks || r.data.items || [];
    const lines = tasks.map((t) => `[${t.completed ? '✓' : '○'}] ${t.summary}${t.due ? ` (due: ${t.due})` : ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无任务)' }] };
  }
);

server.tool(
  'create_task',
  '创建飞书任务',
  {
    summary: z.string().describe('任务标题'),
    description: z.string().optional().describe('任务描述'),
    due: z.string().optional().describe('截止日期, 如 2026-08-20'),
    assignee: z.string().optional().describe('负责人 open_id (ou_开头)'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ summary, description, due, assignee, as }) => {
    const args = ['task', '+create', '--summary', summary];
    if (description) args.push('--description', description);
    if (due) args.push('--due', due);
    if (assignee) args.push('--assignee', assignee);
    const r = await larkJson(args, as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建任务: ${summary}` }] };
  }
);

// ---------- 多维表格工具 ----------

server.tool(
  'base_read_records',
  '读取飞书多维表格记录',
  {
    app_token: z.string().describe('多维表格 app_token (bascn 开头)'),
    table_id: z.string().describe('数据表 table_id (tbl 开头)'),
    limit: z.number().min(1).max(100).optional().describe('记录条数, 默认 20'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ app_token, table_id, limit, as }) => {
    const r = await larkJson(['base', '+data-query', '--base-token', app_token, '--table-id', table_id], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const records = r.data.records || r.data.items || [];
    const lines = records.map((rec, i) => `${i + 1}. ${JSON.stringify(rec.fields || rec).slice(0, 120)}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无记录)' }] };
  }
);

// ---------- 电子表格工具 ----------

server.tool(
  'sheets_read',
  '读取飞书电子表格单元格',
  {
    token: z.string().describe('电子表格 token (shtcn 开头)'),
    range: z.string().describe('单元格范围, 如 A1:D10'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ token, range, as }) => {
    const r = await larkJson(['sheets', '+cells-get', '--spreadsheet-token', token, '--range', range], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: JSON.stringify(r.data).slice(0, 2000) }] };
  }
);

// ---------- Wiki 工具 ----------

server.tool(
  'wiki_search',
  '搜索飞书知识库节点',
  {
    query: z.string().describe('搜索关键词'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, as }) => {
    const r = await larkJson(['wiki', '+node-list', '--query', query], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const nodes = r.data.items || r.data.nodes || [];
    const lines = nodes.map((n) => `${n.title}: ${n.node_token || n.node_id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

// ---------- 邮件工具 ----------

server.tool(
  'mail_list',
  '读取飞书邮箱最近邮件',
  {
    mailbox: z.string().optional().describe('邮箱地址, 默认 me'),
    limit: z.number().min(1).max(30).optional().describe('邮件条数, 默认 10'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ mailbox, limit, as }) => {
    const args = ['mail', '+messages'];
    if (mailbox) args.push('--mailbox', mailbox);
    if (limit) args.push('--page-size', String(limit));
    const r = await larkJson(args, as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.items || r.data.messages || r.data;
    const text = typeof items === 'string' ? items : JSON.stringify(items).slice(0, 1500);
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'mail_send',
  '发送飞书邮件',
  {
    to: z.string().describe('收件人邮箱, 逗号分隔多个'),
    subject: z.string().describe('邮件主题'),
    body: z.string().describe('邮件正文'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ to, subject, body, as }) => {
    const r = await larkJson(['mail', '+send', '--to', to, '--subject', subject, '--body', body], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: '邮件已发送' }] };
  }
);

// ---------- 云盘工具 ----------

server.tool(
  'drive_search',
  '搜索飞书云盘文件',
  {
    query: z.string().describe('文件名关键词'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, as }) => {
    const r = await larkJson(['drive', '+search', '--query', query], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const files = r.data.files || r.data.items || [];
    const lines = files.map((f) => `${f.name}: ${f.token || f.file_token || f.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

server.tool(
  'drive_list_folder',
  '列出飞书云盘文件夹内容',
  {
    folder_token: z.string().optional().describe('文件夹 token (fldcn 开头), 默认根目录'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ folder_token, as }) => {
    const args = ['drive', 'files', 'list'];
    if (folder_token) args.push('--folder-token', folder_token);
    const r = await larkJson(args, as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const files = r.data.files || r.data.items || [];
    const lines = files.map((f) => `[${f.type}] ${f.name}: ${f.token || f.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(空)' }] };
  }
);

// ---------- 妙记工具 ----------

server.tool(
  'minutes_search',
  '搜索飞书妙记 (会议纪要/音视频转写)',
  {
    query: z.string().describe('搜索关键词'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, as }) => {
    const r = await larkJson(['minutes', '+search', '--query', query], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.items || r.data.minutes || [];
    const lines = items.map((m) => `${m.title || m.name || ''}: ${m.minute_token || m.token || m.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

// ---------- 审批工具 ----------

server.tool(
  'approval_list_todo',
  '查询飞书审批待办',
  {
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ as }) => {
    const r = await larkJson(['approval', 'tasks', 'query'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.items || r.data.approvals || r.data.tasks || [];
    const lines = items.map((a) => `[${a.status || '?'}] ${a.approval_name || a.name || a.title || ''}: ${a.instance_code || a.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无待办)' }] };
  }
);

// ---------- 扩展工具 ----------

server.tool(
  'update_document',
  '更新飞书云文档内容 (追加或覆盖)',
  {
    doc: z.string().describe('文档 URL 或 token'),
    content: z.string().describe('要写入的内容'),
    command: z.enum(['append', 'overwrite']).optional().describe('append=追加, overwrite=覆盖, 默认 append'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ doc, content, command, as }) => {
    const r = await larkJson(['docs', '+update', '--doc', doc, '--command', command || 'append', '--content', content], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: '文档已更新' }] };
  }
);

server.tool(
  'task_create_subtask',
  '创建飞书任务子任务',
  {
    parent_task_id: z.string().describe('父任务 ID'),
    summary: z.string().describe('子任务标题'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ parent_task_id, summary, as }) => {
    const r = await larkJson(['task', 'subtasks', 'create', '--task-guid', parent_task_id, '--data', JSON.stringify({ summary })], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建子任务: ${summary}` }] };
  }
);

server.tool(
  'search_messages',
  '搜索飞书消息 (按关键词/会话/发送者)',
  {
    query: z.string().describe('搜索关键词'),
    chat_id: z.string().optional().describe('限定会话 ID'),
    limit: z.number().min(1).max(50).optional().describe('结果条数, 默认 10'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, chat_id, limit, as }) => {
    const args = ['im', '+messages-search', '--query', query];
    if (chat_id) args.push('--chat-id', chat_id);
    if (limit) args.push('--page-size', String(limit));
    const r = await larkJson(args, as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.messages || r.data.items || [];
    const lines = items.map((m) => `[${m.sender?.name || m.sender?.id || '?'}] ${String(m.content || m.body?.content || '').slice(0, 80)}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

server.tool(
  'read_thread_messages',
  '读取飞书话题消息',
  {
    thread_id: z.string().describe('话题 ID (omt_ 开头)'),
    limit: z.number().min(1).max(50).optional().describe('消息条数, 默认 20'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ thread_id, limit, as }) => {
    const r = await larkJson(['im', '+threads-messages-list', '--thread-id', thread_id, '--page-size', String(limit || 20)], as || 'bot');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.messages || r.data.items || [];
    const lines = items.map((m) => `[${m.sender?.sender_type || '?'}] ${String(m.content || m.body?.content || '').slice(0, 80)}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(空话题)' }] };
  }
);

server.tool(
  'calendar_freebusy',
  '查询飞书日历忙闲状态',
  {
    date: z.string().describe('日期 YYYY-MM-DD'),
    user_ids: z.string().optional().describe('用户 open_id, 逗号分隔'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ date, user_ids, as }) => {
    const r = await larkJson(['calendar', '+free-busy', '--date', date, '--user-ids', user_ids || ''], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: JSON.stringify(r.data).slice(0, 1500) }] };
  }
);

server.tool(
  'doc_list_comments',
  '读取飞书云文档评论',
  {
    doc: z.string().describe('文档 URL 或 token'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ doc, as }) => {
    const r = await larkJson(['drive', 'file.comments', 'list', '--file-token', doc, '--file-type', 'docx'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.comments || r.data.items || [];
    const lines = items.map((c) => `[${c.operator?.name || '?'}] ${String(c.content || '').slice(0, 80)}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无评论)' }] };
  }
);

// ---------- 补充工具 ----------

server.tool(
  'doc_insert_media',
  '向飞书云文档插入图片或文件',
  {
    doc: z.string().describe('文档 URL 或 token'),
    source: z.string().describe('媒体来源: 本地相对路径或 URL'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ doc, source, as }) => {
    const r = await larkJson(['docs', '+media-insert', '--doc', doc, '--file', source], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: '媒体已插入文档' }] };
  }
);

server.tool(
  'search_docs',
  '搜索飞书云文档 (标题/内容关键词)',
  {
    query: z.string().describe('搜索关键词'),
    limit: z.number().min(1).max(50).optional().describe('结果条数, 默认 10'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, limit, as }) => {
    const r = await larkJson(['drive', '+search', '--query', query, '--page-size', String(limit || 10)], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.entities || r.data.files || r.data.items || [];
    const lines = items.map((e) => `[${e.type || 'doc'}] ${e.title || e.name || ''}: ${e.url || e.token || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

server.tool(
  'wiki_list_spaces',
  '列出飞书知识库空间',
  {
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ as }) => {
    const r = await larkJson(['wiki', '+space-list'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.spaces || r.data.items || [];
    const lines = items.map((s) => `${s.name}: ${s.space_id || s.id || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无空间)' }] };
  }
);

server.tool(
  'task_get_detail',
  '获取飞书任务详情',
  {
    task_id: z.string().describe('任务 ID'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ task_id, as }) => {
    const r = await larkJson(['task', 'task', 'get', '--task-guid', task_id], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const t = r.data.task || r.data;
    const lines = [
      `标题: ${t.summary || t.title || ''}`,
      `状态: ${t.completed ? '已完成' : '未完成'}`,
      `截止: ${t.due || '-'}`,
      `描述: ${String(t.description || '').slice(0, 200)}`,
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'task_related',
  '获取与用户相关的飞书任务',
  {
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ as }) => {
    const r = await larkJson(['task', '+get-related-tasks'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const tasks = r.data.tasks || r.data.items || [];
    const lines = tasks.map((t) => `[${t.completed ? '✓' : '○'}] ${t.summary}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(无相关任务)' }] };
  }
);

// ---------- 补充工具 2 ----------

server.tool(
  'task_add_comment',
  '给飞书任务添加评论',
  {
    task_id: z.string().describe('任务 ID'),
    content: z.string().describe('评论内容'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ task_id, content, as }) => {
    const r = await larkJson(['task', '+comment', '--task-guid', task_id, '--content', content], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: '评论已添加' }] };
  }
);

server.tool(
  'calendar_search_events',
  '搜索飞书日历事件',
  {
    query: z.string().describe('关键词'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ query, as }) => {
    const r = await larkJson(['calendar', '+search-event', '--query', query], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    const items = r.data.events || r.data.items || [];
    const lines = items.map((e) => `${e.summary || e.name || ''}: ${e.start_time || e.start || ''}`);
    return { content: [{ type: 'text', text: lines.join('\n') || '(未找到)' }] };
  }
);

server.tool(
  'base_create_table',
  '在飞书多维表格中创建数据表',
  {
    base_token: z.string().describe('多维表格 app_token (bascn 开头)'),
    name: z.string().describe('数据表名称'),
    fields: z.string().optional().describe('字段 JSON, 如 [{"name":"Title","type":"text"}]'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ base_token, name, fields, as }) => {
    const r = await larkJson(['base', '+table-create', '--base-token', base_token, '--name', name, '--fields', fields || '[]'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建数据表: ${name}` }] };
  }
);

server.tool(
  'base_create_record',
  '在飞书多维表格中创建记录',
  {
    app_token: z.string().describe('多维表格 app_token (bascn 开头)'),
    table_id: z.string().describe('数据表 table_id (tbl 开头)'),
    fields: z.string().describe('字段 JSON 对象, 如 {"名称":"张三"}'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ app_token, table_id, fields, as }) => {
    const r = await larkJson(['base', '+records-create', '--app-token', app_token, '--table-id', table_id, '--fields', fields], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: '记录已创建' }] };
  }
);

// ---------- 交互提问 ----------

server.tool(
  'ask_user_question',
  '向用户发送带选项的提问卡片, 等待用户在飞书中选择 (异步, 选择结果会作为后续消息返回)',
  {
    chat_id: z.string().describe('会话 ID (oc_开头)'),
    question: z.string().describe('问题内容'),
    options: z.array(z.string()).describe('选项列表 (2-5 个)'),
  },
  async ({ chat_id, question, options }) => {
    if (!options || options.length < 2 || options.length > 5) {
      return { content: [{ type: 'text', text: '选项需 2-5 个' }] };
    }
    // 构造交互卡片 (按钮选项)
    const elements = options.map((opt, i) => ({
      tag: 'button',
      text: { tag: 'plain_text', content: opt },
      type: 'primary',
      value: { ask_user_option: opt, question },
    }));
    const card = {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: '❓ 需要你确认' }, template: 'blue' },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: question } },
        ...elements,
      ],
    };
    const res = await runLark(['im', '+messages-send', '--as', 'bot', '--chat-id', chat_id, '--msg-type', 'interactive', '--content', JSON.stringify(card)]);
    try {
      const d = JSON.parse(res.out);
      if (d.ok === false) return { content: [{ type: 'text', text: `失败: ${d.error?.message || res.err}` }] };
      return { content: [{ type: 'text', text: `已发送提问卡片 (messageId: ${d.data?.message_id || ''}), 等待用户选择` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `发送失败: ${res.err || res.out}` }] };
    }
  }
);

// ---------- 补充工具 3 ----------

server.tool(
  'base_create_field',
  '在飞书多维表格中创建字段',
  {
    app_token: z.string().describe('多维表格 app_token (bascn 开头)'),
    table_id: z.string().describe('数据表 table_id (tbl 开头)'),
    field_name: z.string().describe('字段名称'),
    field_type: z.string().optional().describe('字段类型 (text/number/select/date 等)'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ app_token, table_id, field_name, field_type, as }) => {
    const field = JSON.stringify({ field_name, type: field_type || 'text' });
    const r = await larkJson(['base', '+field-create', '--base-token', app_token, '--table-id', table_id, '--json', field], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建字段: ${field_name}` }] };
  }
);

server.tool(
  'base_create_view',
  '在飞书多维表格中创建视图',
  {
    app_token: z.string().describe('多维表格 app_token (bascn 开头)'),
    table_id: z.string().describe('数据表 table_id (tbl 开头)'),
    view_name: z.string().describe('视图名称'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ app_token, table_id, view_name, as }) => {
    const r = await larkJson(['base', '+view-create', '--base-token', app_token, '--table-id', table_id, '--name', view_name], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建视图: ${view_name}` }] };
  }
);

server.tool(
  'calendar_add_attendee',
  '向飞书日程添加参会人',
  {
    event_id: z.string().describe('日程事件 ID'),
    attendee_ids: z.string().describe('参会人 open_id, 逗号分隔'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ event_id, attendee_ids, as }) => {
    const r = await larkJson(['calendar', '+update', '--event-id', event_id, '--add-attendee-ids', attendee_ids], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: '已添加参会人' }] };
  }
);

server.tool(
  'wiki_create_node',
  '在飞书知识库创建节点',
  {
    space_id: z.string().describe('知识库空间 ID'),
    title: z.string().describe('节点标题'),
    obj_type: z.string().optional().describe('对象类型 (doc/sheet/bitable 等, 默认 doc)'),
    as: z.enum(['bot', 'user']).optional(),
  },
  async ({ space_id, title, obj_type, as }) => {
    const r = await larkJson(['wiki', '+node-create', '--space-id', space_id, '--title', title, '--obj-type', obj_type || 'doc'], as || 'user');
    if (!r.ok) return { content: [{ type: 'text', text: `失败: ${r.error}` }] };
    return { content: [{ type: 'text', text: `已创建节点: ${title}` }] };
  }
);

// ---------- 启动 ----------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[feishu-mcp] server ready\n');
}

main().catch((e) => {
  process.stderr.write(`[feishu-mcp] fatal: ${e.message}\n`);
  process.exit(1);
});
