<div align="center">

# DSH ↔ Feishu/Lark Bridge

**A bidirectional AI channel connecting DeepSeek Harness to Feishu/Lark**

[![CI](https://github.com/shrekcg/dsh-lark-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/shrekcg/dsh-lark-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](../package.json)
[![Tools](https://img.shields.io/badge/MCP%20tools-40-orange.svg)](../src/tools/mcp-server.js)

[中文文档](../README.md)

</div>

---

## Introduction

**DSH ↔ Feishu/Lark Bridge** is a complete bidirectional channel plugin that connects [DeepSeek Harness](https://github.com/deepseek-ai) (DSH, an AI agent runtime) to Feishu / Lark. It gives your AI assistant a "first-class app" experience inside Feishu:

- 💬 **Persistent conversations**: cross-message context memory, topic isolation, group & DM chat
- ⌨️ **True streaming output**: token-by-token display with a smooth typewriter effect
- 🛠️ **40 Feishu object tools**: the agent can operate docs, sheets, calendar, tasks, mail, and more
- 🧩 **Pluggable plugin form**: no changes to the DSH core; one-click install / uninstall

Aligned with the capabilities of the [OpenClaw Feishu plugin](https://github.com/larksuite/openclaw-lark), but built on the DSH ecosystem.

---

## ✨ Features

### 💬 Conversation
| Feature | Description |
|---|---|
| Persistent sessions | Cross-message memory (DSH `agents.resume`) |
| Topic isolation | Each thread gets an independent context (fork from mainline) |
| Group chat | Responds without @, or per-group fine-grained policies (allowlist / mention-only) |
| Thinking reaction | THINKING shown on receive, auto-removed after reply |
| True streaming | Token-by-token display with adaptive typewriter pacing |
| Elapsed footer | Small "Completed · X.Xs" footer at the bottom, aligned with OpenClaw |
| @ user rendering | Native mentions of users / @all in replies |
| Bot-to-bot @ | Configurable bot-to-bot conversations |

### 📎 Messaging
| Feature | Description |
|---|---|
| Media send/receive | Image / file / audio / video download & send |
| Merge-forward | Recognizes and expands merged-forward messages |
| Reaction feedback | 👍/❤️ reactions fed back to the agent |
| Doc-comment @ | @ the bot in doc comments to trigger a conversation |

### 🛠️ Feishu Object Tools (MCP × 40)

Exposes **40 Feishu tools** via [Model Context Protocol](https://modelcontextprotocol.io), callable natively as `mcp__feishu__*`:

| Category | Tools |
|---|---|
| Messaging | `send_message` `read_messages` `search_chats` `get_chat_members` `search_messages` `read_thread_messages` |
| Docs | `read_document` `create_document` `update_document` `doc_insert_media` `doc_list_comments` |
| Calendar | `calendar_agenda` `create_calendar_event` `calendar_freebusy` `calendar_search_events` `calendar_add_attendee` |
| Tasks | `get_my_tasks` `create_task` `task_create_subtask` `task_get_detail` `task_related` `task_add_comment` |
| Base (Bitable) | `base_read_records` `base_create_table` `base_create_record` `base_create_field` `base_create_view` |
| Sheets | `sheets_read` |
| Wiki | `wiki_search` `wiki_list_spaces` `wiki_create_node` |
| Mail | `mail_list` `mail_send` |
| Drive | `drive_search` `drive_list_folder` |
| Minutes / Approval / Search | `minutes_search` `approval_list_todo` `search_docs` |
| Contacts | `get_user_info` |

### 🧩 Platform
| Feature | Description |
|---|---|
| Multi-account / multi-bot | One process manages multiple bots with isolated sessions |
| Pluggable plugin | One-click install / uninstall, no DSH core changes |
| Setup wizard | `npm run setup` — 6-step guided init (app / permissions / auth / events) |
| Diagnostics & self-repair | `npm run doctor` — 21 checks + `--fix` auto-repair |
| Feature checklist | `npm run features` — see each capability's config status |
| Permission management | Auto-detects missing scopes, generates one-click apply links |
| CI | GitHub Actions: unit tests + MCP smoke verification |
| Channel status page | Built-in HTTP status page — see Feishu online/account/health in real time (`http://127.0.0.1:8899`) |

---

## 📦 Quick Start

### Prerequisites

| Dependency | Description |
|---|---|
| [DSH](https://github.com/deepseek-ai) | DeepSeek Harness runtime |
| [lark-cli](https://www.npmjs.com/package/@larksuite/cli) | Official Feishu CLI (tool execution backend) |
| Node.js ≥ 18 | Runtime |

### Install

```bash
# 1. Clone
git clone https://github.com/shrekcg/dsh-lark-bridge.git
cd dsh-lark-bridge

# 2. Install dependencies
npm install

# 3. Setup wizard (app creation / auth / event subscription, step by step)
npm run setup

# 4. Install as plugin + launchd service
npm run install-bridge

# 5. Verify
npm run doctor        # diagnostics (21 checks)
npm run features      # feature checklist
```

> See [docs/SETUP.md](SETUP.md) and [docs/INSTALL.md](INSTALL.md) for details.

---

## 🔧 Configuration

Configure via environment variables or `config.json` (see [config.example.json](../config.example.json)):

| Variable | Default | Description |
|---|---|---|
| `LARK_APP_ID` | — | Feishu app ID |
| `LARK_APP_SECRET` | — | Feishu app secret |
| `REQUIRE_MENTION` | `false` | Whether group chat requires @ to respond |
| `ALLOW_BOTS` | `false` | Bot-to-bot @: `false` / `true` / `mentions` |
| `GROUP_POLICY` | `open` | Group policy: `open` / `allowlist` / `closed` |
| `GROUP_ALLOW_FROM` | — | Group allowlist (comma-separated open_ids) |
| `REACTION_NOTIFICATIONS` | `off` | Reaction feedback: `off` / `own` / `all` |
| `STREAM_THROTTLE_MS` | `60` | Streaming throttle time threshold (ms) |
| `STREAM_THROTTLE_CHARS` | `3` | Streaming throttle char threshold |
| `ALLOW_USER_WRITES` | — | Allow user-identity writes (default: only messaging uses bot) |
| `DSH_BIN` / `DSH_HOME` | — | DSH paths |

---

## 🚀 Usage

### Chat
- **DM**: message the bot directly in Feishu
- **Group**: add the bot to a group, then chat (with or without @, depending on config)
- **Thread**: create a thread on a group message for an isolated context

### Feishu Tools
Just ask in natural language:
- "What's on my calendar today?"
- "Create a doc with the content ..."
- "Send a message to XX"
- "List my to-do tasks"

### Management Commands

```bash
npm start                # start the bridge
# Status page: open http://127.0.0.1:8899 (Feishu online status / account / health)
npm run setup            # setup wizard
npm run doctor           # diagnostics (--fix auto-repair)
npm run features         # feature checklist
npm test                 # run tests (65 cases)
npm run install-bridge   # install plugin + launchd service
npm run uninstall-bridge # uninstall (reversible, no DSH core impact)
npm run mcp              # run MCP server standalone
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│                     Feishu / Lark                 │
│   DM · Group · Thread · Reaction · Comment · Card │
└───────────────────────┬──────────────────────────┘
                        │ WebSocket long-connection (SDK)
┌───────────────────────▼──────────────────────────┐
│               bridge (daemon process)            │
│  ┌─────────┐ ┌────────────┐ ┌─────────────────┐  │
│  │ channel │ │  inbound   │ │    outbound     │  │
│  │ (SDK)   │ │ policy     │ │ stream (true)   │  │
│  │         │ │ media      │ │ mention (@)     │  │
│  │         │ │ reaction   │ │ footer (elapsed)│  │
│  │         │ │ merge-fw   │ │                 │  │
│  └────┬────┘ └─────┬──────┘ └────────┬────────┘  │
│       └────────────┼─────────────────┘           │
└────────────────────┼─────────────────────────────┘
                     │ DSH headless (persistent session)
              ┌──────▼──────┐
              │  agents.resume│
              │  + MCP client │
              └──────┬──────┘
                     │ mcp__feishu__* (40 tools)
              ┌──────▼──────┐
              │ Feishu MCP  │
              │ server      │
              └──────┬──────┘
                     │ lark-cli
              ┌──────▼──────┐
              │  Feishu OpenAPI│
              └─────────────┘
```

- **Receive**: `@larksuite/channel` SDK WebSocket long-connection (no public callback URL needed)
- **Session**: fixed session + DSH `agents.resume` (cross-message memory)
- **Tools**: 40 MCP tools with lark-cli execution backend

See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for details.

---

## 📁 Project Structure

```
dsh-lark-bridge/
├── src/
│   ├── index.js              # entry (multi-account message pipeline)
│   ├── config.js             # configuration
│   ├── channel.js            # Feishu channel (SDK + streaming)
│   ├── session.js            # persistent sessions + mutex lock
│   ├── core/
│   │   ├── scope-manager.js  # permission management
│   │   ├── adaptive.js       # adaptive streaming step
│   │   └── pacing.js         # streaming pacing control
│   ├── inbound/
│   │   ├── policy.js         # group policy / bot / @
│   │   ├── media.js          # media receive
│   │   ├── reaction.js       # reaction feedback
│   │   ├── merge-forward.js  # merge-forward
│   │   └── comment.js        # doc-comment @
│   ├── outbound/
│   │   └── mention.js        # @ rendering
│   ├── tools/
│   │   └── mcp-server.js     # Feishu MCP server (40 tools)
│   └── commands/
│       ├── doctor.js         # diagnostics & self-repair (21 checks)
│       └── features.js       # feature checklist
├── dsh-lark-session/         # DSH plugin (persistent-session runner)
├── scripts/
│   ├── install.js            # install / uninstall / status
│   └── setup.js              # setup wizard
├── tests/                    # 65 unit tests
└── docs/                     # documentation
```

---

## 📚 Documentation

| Doc | Description |
|---|---|
| [SETUP.md](SETUP.md) | Detailed setup guide |
| [INSTALL.md](INSTALL.md) | Plugin install guide |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture design |
| [README.md](../README.md) | 中文 README |

---

## 🧪 Testing

```bash
npm test    # 65 unit tests
```

CI (GitHub Actions) automatically runs: unit tests + syntax checks + MCP server smoke verification.

---

## 📄 License

[MIT](../LICENSE)

## 🙏 Credits

- [DeepSeek Harness](https://github.com/deepseek-ai) — Agent runtime
- [OpenClaw](https://github.com/openclaw/openclaw) & the [official Feishu plugin](https://github.com/larksuite/openclaw-lark)
- [@larksuite/channel](https://www.npmjs.com/package/@larksuite/channel) — Feishu SDK
- [lark-cli](https://www.npmjs.com/package/@larksuite/cli) — Feishu CLI
