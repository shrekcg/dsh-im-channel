# DSH ↔ Feishu/Lark Bridge

A complete bidirectional channel connecting [DeepSeek Harness](https://github.com/deepseek-ai) to Feishu/Lark, featuring persistent conversation sessions, topic-isolated context, group chat, streaming cards, media, and Feishu object tools — aligned with the OpenClaw Feishu plugin experience.

> **中文**: See [README.md](../README.md)

## ✨ Features

### Conversation
- **Persistent sessions**: cross-message context memory (via DSH `agents.resume`)
- **Topic isolation**: each thread gets a fully independent session (like fork)
- **Group chat**: reply without @ (configurable to mention-only or per-group policies)
- **Thinking reaction**: 🤔 THINKING appears on receive, removed after reply
- **Streaming card replies**: typewriter effect, no "edited" marker
- **@ user rendering**: native mentions in AI replies
- **Bot-to-bot**: `allowBots` config for inter-bot conversations

### Messaging
- **Media in/out**: image/file/audio/video download & send
- **Merge-forward**: recognition and expansion
- **Reaction feedback**: 👍/❤️ reactions fed to the agent (requires event subscription)

### Feishu Object Tools (MCP)
**31 tools** exposed via Model Context Protocol, callable as `mcp__feishu__*`:

| Category | Tools |
|---|---|
| Messaging | `send_message` `read_messages` `search_chats` `get_chat_members` `search_messages` `read_thread_messages` |
| Docs | `read_document` `create_document` `update_document` `doc_insert_media` `doc_list_comments` |
| Calendar | `calendar_agenda` `create_calendar_event` `calendar_freebusy` |
| Tasks | `get_my_tasks` `create_task` `task_create_subtask` `task_get_detail` `task_related` |
| Base/Sheets | `base_read_records` `sheets_read` |
| Wiki | `wiki_search` `wiki_list_spaces` |
| Mail | `mail_list` `mail_send` |
| Drive | `drive_search` `drive_list_folder` |
| Minutes | `minutes_search` |
| Approval | `approval_list_todo` |
| Search | `search_docs` |
| Contacts | `get_user_info` |

### Platform
- **Multi-account**: multiple Feishu bots in one process, sessions auto-isolated
- **Doctor**: `npm run doctor` (19 checks + `--fix` auto-repair)
- **Scope manager**: auto-detect missing permissions, generate apply links
- **Tool tracing**: reply shows the tool chain the agent executed

## 📦 Install

See [docs/SETUP.md](../docs/SETUP.md) for full setup (Feishu app config, permissions, launchd).

Quick start:
```bash
npm install
# configure LARK_APP_ID / LARK_APP_SECRET (env or config.json)
npm start          # run bridge
npm run doctor     # diagnostics
npm test           # 34 unit tests
```

## 🏗️ Architecture

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

```
Feishu ──SDK WSClient──▶ bridge (src/)
  policy / media / reaction / merge-forward / comment
  → DSH persistent session (agents.resume)
  → Feishu MCP server (31 tools, stdio)
  → streaming card reply + reaction + @
```

## 📁 Project Structure

```
src/
├── index.js              # entry (multi-account)
├── config.js / channel.js / session.js
├── core/scope-manager.js # permission management
├── inbound/              # policy, media, reaction, merge-forward, comment
├── outbound/mention.js   # @ rendering
├── tools/mcp-server.js   # Feishu MCP server (31 tools)
└── commands/doctor.js    # diagnostics
tests/                    # 34 unit tests
docs/                     # documentation
```

## 📄 License

MIT

## 🙏 Credits

- [OpenClaw](https://github.com/openclaw/openclaw) & [official Feishu plugin](https://github.com/larksuite/openclaw-lark)
- [@larksuite/channel](https://www.npmjs.com/package/@larksuite/channel) SDK
