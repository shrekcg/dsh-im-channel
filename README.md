<div align="center">

# DSH ↔ IM Channel

**将 DeepSeek Harness 接入飞书、钉钉、Telegram、Slack、Discord、QQ 等 IM 渠道的统一通道**

[![CI](https://github.com/shrekcg/dsh-im-channel/actions/workflows/ci.yml/badge.svg)](https://github.com/shrekcg/dsh-im-channel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Tools](https://img.shields.io/badge/MCP%20tools-40-orange.svg)](src/tools/mcp-server.js)
[![Market](https://img.shields.io/badge/awesome--dsh--plugin-on%20market-7c3aed.svg)](https://awesome-dsh-plugin.com/p/shrekcg/dsh-im-channel/)

[![English](https://img.shields.io/badge/English-Readme-3370ff.svg?style=for-the-badge)](docs/README.en.md) [![中文](https://img.shields.io/badge/中文-说明-00b42a.svg?style=for-the-badge)](README.md)

</div>

---

## 项目简介

**DSH ↔ IM Channel** 是一个把 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH，AI Agent 运行时）接入多个 IM 渠道（飞书/钉钉/Telegram/Slack/Discord/QQ 等）的统一双向通道插件。它在飞书里为你的 AI 助手提供「原生应用」般的完整体验：

- 💬 **持久对话**：跨消息上下文记忆，话题隔离，群聊/私聊
- ⌨️ **真流式输出**：边生成边显示，平滑打字机效果
- 🛠️ **40 个飞书对象工具**：agent 可直接操作文档、表格、日历、任务、邮件等
- 🧩 **可插拔插件形态**：不侵入 DSH 核心，一键安装/卸载

对齐 [OpenClaw 飞书官方插件](https://github.com/larksuite/openclaw-lark) 的能力与体验，但基于 DSH 生态构建。

---

## ✨ 功能特性

### 🌐 支持渠道

> ⚠️ 诚实标注：**当前稳定可用的是飞书与 Telegram**（完整收发）。钉钉/Slack/Discord 为**实验性/半可用**（见下方状态），QQ/微信/WhatsApp 未提供适配器（不在本版本范围）。

| 渠道 | 状态 | 接入方式 |
|---|---|---|
| 飞书 📘 | ✅ **完整支持（主力）** | WebSocket 长连接（开放平台建应用） |
| Telegram ✈️ | ✅ 完整支持 | BotFather 聊天内创建（最简单） |
| Slack 🟣 | 🟡 半可用（接收需 @slack/socket-mode 依赖） | Socket Mode |
| Discord 🎮 | 🟡 半可用（接收需 discord.js 依赖） | Gateway（bot token） |
| 钉钉 📱 | 🟡 实验（Stream 接入未完整实现） | 需 @alicloud/dingtalk-stream |

> 在飞书里发 `/channels` 查看全部渠道及接入步骤，或 `/channels add <渠道>` 获取引导。

### 💬 对话体验
| 特性 | 说明 |
|---|---|
| 持久会话 | 跨消息上下文记忆（DSH `agents.resume`） |
| 话题隔离 | 每个话题独立上下文，如从主线 fork |
| 群聊支持 | 不 @ 也响应，或按群细粒度策略（白名单/仅@） |
| 思考表情 | 收到消息显示 THINKING，回复后自动移除 |
| 真流式输出 | 边生成边显示，平滑打字机（自适应节奏） |
| 底部耗时 | 回复底部小字「已完成 · 耗时 xx」，对齐 OpenClaw |
| @ 用户渲染 | 回复中可 @ 用户/所有人（原生 mention） |
| Bot 互 @ | 支持 bot 间对话（可配置） |

### 📎 消息能力
| 特性 | 说明 |
|---|---|
| 多媒体收发 | 图片/文件/音频/视频下载与发送 |
| 合并转发 | 合并转发消息识别与展开 |
| 表情反馈 | 👍/❤️ 等表情反馈给 agent |
| 文档评论@ | 文档评论中 @ 机器人触发对话 |

### 🛠️ 飞书对象工具（MCP × 40）

通过 [Model Context Protocol](https://modelcontextprotocol.io) 暴露 **40 个飞书工具**，agent 以 `mcp__feishu__*` 原生调用：

| 类别 | 工具 |
|---|---|
| 消息 | `send_message` `read_messages` `search_chats` `get_chat_members` `search_messages` `read_thread_messages` |
| 文档 | `read_document` `create_document` `update_document` `doc_insert_media` `doc_list_comments` |
| 日历 | `calendar_agenda` `create_calendar_event` `calendar_freebusy` `calendar_search_events` `calendar_add_attendee` |
| 任务 | `get_my_tasks` `create_task` `task_create_subtask` `task_get_detail` `task_related` `task_add_comment` |
| 多维表格 | `base_read_records` `base_create_table` `base_create_record` `base_create_field` `base_create_view` |
| 电子表格 | `sheets_read` |
| Wiki | `wiki_search` `wiki_list_spaces` `wiki_create_node` |
| 邮件 | `mail_list` `mail_send` |
| 云盘 | `drive_search` `drive_list_folder` |
| 妙记/审批/搜索 | `minutes_search` `approval_list_todo` `search_docs` |
| 通讯录 | `get_user_info` |

### 🧩 平台能力
| 特性 | 说明 |
|---|---|
| 多账号多机器人 | 一个进程管理多个飞书 bot，session 自动隔离 |
| 可插拔插件 | 一键安装/卸载，不侵入 DSH 核心 |
| 初始化向导 | `npm run setup` 6 步引导（应用/权限/授权/事件订阅） |
| 诊断自修复 | `npm run doctor` 21 项检查 + `--fix` 自动修复 |
| 功能清单 | `npm run features` 查看各能力配置状态 |
| 权限管理 | 自动检测缺失权限，生成一键申请链接 |
| CI | GitHub Actions 自动测试 + MCP 冒烟验证 |
| 渠道状态页 | 内置 HTTP 状态页，实时查看飞书在线/账号/健康（`http://127.0.0.1:8899`）|
| IM 机器人设置页 | DSH 设置页「插件」内新增 **IM 机器人** tab，展示渠道状态（`web-plugin/`）|
| 斜杠命令 | 飞书对话内直接使用 `/new` `/compact` `/model` `/status` 等命令 |

### ⌨️ 斜杠命令

在飞书对话中直接输入命令（不消耗 AI 调用，即时响应）：

| 命令 | 说明 |
|---|---|
| `/help` | 显示所有可用命令 |
| `/new` / `/clear` | 开启新对话（清空当前会话上下文） |
| `/compact` | 压缩当前会话（减少上下文） |
| `/model [name]` | 查看 / 切换模型（如 `/model deepseek-v4-flash`） |
| `/status` / `/state` | 查看当前状态（模型/会话/工具/运行时长） |
| `/tools` | 列出可用飞书工具（40 个） |
| `/features` | 查看功能配置清单 |
| `/doctor` | 运行诊断 |

---

## 📦 快速开始

### 前置依赖

| 依赖 | 说明 |
|---|---|
| [DSH](https://github.com/deepseek-ai) | DeepSeek Harness 运行时 |
| [lark-cli](https://www.npmjs.com/package/@larksuite/cli) | 飞书官方 CLI（工具执行后端） |
| Node.js ≥ 18 | 运行环境 |

### 安装

```bash
# 1. 克隆
git clone https://github.com/shrekcg/dsh-im-channel.git
cd dsh-im-channel

# 2. 安装依赖
npm install

# 3. 初始化向导 (创建应用/授权/事件订阅 一步步引导)
npm run setup

# 4. 安装为插件 + 常驻服务
npm run install-bridge

# 5. 验证
npm run doctor        # 诊断 (21 项)
npm run features      # 功能清单
```

> 详细配置见 [docs/SETUP.md](docs/SETUP.md) 与 [docs/INSTALL.md](docs/INSTALL.md)。

---

## 🔧 配置

配置通过环境变量或 `config.json`（见 [config.example.json](config.example.json)）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `LARK_APP_ID` | — | 飞书应用 App ID |
| `LARK_APP_SECRET` | — | 飞书应用密钥 |
| `REQUIRE_MENTION` | `false` | 群聊是否要求 @ 才响应 |
| `ALLOW_BOTS` | `false` | bot 互 @：`false`/`true`/`mentions` |
| `GROUP_POLICY` | `open` | 群策略：`open`/`allowlist`/`closed` |
| `GROUP_ALLOW_FROM` | — | 群白名单（逗号分隔 open_id） |
| `REACTION_NOTIFICATIONS` | `off` | 表情反馈：`off`/`own`/`all` |
| `STREAM_THROTTLE_MS` | `60` | 流式节流时间阈值 (ms) |
| `STREAM_THROTTLE_CHARS` | `3` | 流式节流字符阈值 |
| `ALLOW_USER_WRITES` | — | 允许 user 身份写操作（默认仅发消息用 bot） |
| `DSH_BIN` / `DSH_HOME` | — | DSH 路径 |

---

## 🚀 使用

### 对话
- **私聊**：直接在飞书单聊机器人
- **群聊**：拉机器人进群，直接发消息（或 @，取决于配置）
- **话题**：在群消息上创建话题，获得独立上下文

### 飞书工具
直接用自然语言告诉 agent：
- 「帮我查一下今天的日程」
- 「创建一个文档，内容是……」
- 「给 XX 发一条消息」
- 「列一下我的待办任务」

### 管理命令

```bash
npm start                # 启动 bridge
# 状态页: 打开 http://127.0.0.1:8899 (飞书在线状态/账号/健康)
npm run setup            # 初始化向导
npm run doctor           # 诊断 (--fix 自动修复)
npm run features         # 功能配置清单
npm test                 # 运行测试 (65 用例)
npm run install-bridge   # 安装插件 + 常驻服务
npm run uninstall-bridge # 卸载 (可逆, 不影响 DSH 核心)
npm run mcp              # 单独运行 MCP server
```

---

## 🏗️ 架构

```
┌──────────────────────────────────────────────────┐
│                     飞书 / Lark                   │
│   用户私聊 · 群聊 · 话题 · 表情 · 评论 · 卡片交互   │
└───────────────────────┬──────────────────────────┘
                        │ WebSocket 长连接 (SDK)
┌───────────────────────▼──────────────────────────┐
│               bridge (常驻进程)                   │
│  ┌─────────┐ ┌────────────┐ ┌─────────────────┐  │
│  │ channel │ │  inbound   │ │    outbound     │  │
│  │ (SDK)   │ │ policy     │ │ stream (真流式)  │  │
│  │         │ │ media      │ │ mention (@渲染)  │  │
│  │         │ │ reaction   │ │ footer (耗时)   │  │
│  │         │ │ merge-fw   │ │                 │  │
│  └────┬────┘ └─────┬──────┘ └────────┬────────┘  │
│       └────────────┼─────────────────┘           │
└────────────────────┼─────────────────────────────┘
                     │ DSH headless (持久会话)
              ┌──────▼──────┐
              │  agents.resume│
              │  + MCP client │
              └──────┬──────┘
                     │ mcp__feishu__* (40 工具)
              ┌──────▼──────┐
              │ Feishu MCP  │
              │ server      │
              └──────┬──────┘
                     │ lark-cli
              ┌──────▼──────┐
              │  飞书 OpenAPI│
              └─────────────┘
```

- **接收**：`@larksuite/channel` SDK WebSocket 长连接（无需公网回调地址）
- **会话**：固定 session + DSH `agents.resume`（跨消息记忆）
- **工具**：40 个 MCP 工具，lark-cli 执行后端

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 📁 项目结构

```
dsh-im-channel/
├── src/
│   ├── index.js              # 入口 (多账号消息流水线)
│   ├── config.js             # 配置管理
│   ├── channel.js            # 飞书通道 (SDK + 流式)
│   ├── session.js            # 持久会话 + 互斥锁
│   ├── core/
│   │   ├── scope-manager.js  # 权限管理
│   │   ├── adaptive.js       # 流式自适应步长
│   │   └── pacing.js         # 流式节奏控制
│   ├── inbound/
│   │   ├── policy.js         # 群策略/bot/@
│   │   ├── media.js          # 多媒体接收
│   │   ├── reaction.js       # 表情反馈
│   │   ├── merge-forward.js  # 合并转发
│   │   └── comment.js        # 文档评论@
│   ├── outbound/
│   │   └── mention.js        # @渲染
│   ├── tools/
│   │   └── mcp-server.js     # 飞书 MCP server (40 工具)
│   └── commands/
│       ├── doctor.js         # 诊断自修复 (21 项)
│       └── features.js       # 功能配置清单
├── dsh-lark-session/         # DSH 插件 (持久会话 runner)
├── scripts/
│   ├── install.js            # 安装/卸载/状态
│   └── setup.js              # 初始化向导
├── tests/                    # 65 个单元测试
└── docs/                     # 文档
```

---

## 📚 文档

| 文档 | 说明 |
|---|---|
| [SETUP.md](docs/SETUP.md) | 详细配置指南 |
| [INSTALL.md](docs/INSTALL.md) | 插件化安装指南 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构设计 |
| [README.en.md](docs/README.en.md) | English README |

---

## 🧪 测试

```bash
npm test    # 65 个单元测试
```

CI（GitHub Actions）自动运行：单元测试 + 语法检查 + MCP server 冒烟验证。

---

## 📄 License

[MIT](LICENSE)

## 🙏 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai) — Agent 运行时
- [OpenClaw](https://github.com/openclaw/openclaw) 及 [飞书官方插件](https://github.com/larksuite/openclaw-lark)
- [@larksuite/channel](https://www.npmjs.com/package/@larksuite/channel) — 飞书 SDK
- [lark-cli](https://www.npmjs.com/package/@larksuite/cli) — 飞书 CLI
