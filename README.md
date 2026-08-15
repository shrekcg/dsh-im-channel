# DSH ↔ Feishu/Lark Bridge

<p align="center">
  <a href="https://github.com/shrekcg/dsh-lark-bridge/actions"><img src="https://github.com/shrekcg/dsh-lark-bridge/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
</p>


将 [DeepSeek Harness](https://github.com/deepseek-ai) 接入飞书/Lark 的完整双向通道，提供持久会话、话题隔离、群聊、流式卡片、多媒体、飞书对象工具等能力——对齐 OpenClaw 飞书官方插件的体验。

> **English**: See [README.en.md](docs/README.en.md) (coming soon)

## ✨ 功能特性

### 对话体验
- **持久对话会话**：跨消息上下文记忆（基于 DSH `agents.resume`）
- **话题独立上下文**：每个话题（thread）完全独立的 session，如从主线 fork
- **群聊支持**：不 @ 也响应（可配置为仅 @ 响应，或按群细粒度策略）
- **思考表情**：收到消息立即显示 🤔 THINKING，回复完成后移除
- **卡片流式打字机**：回复逐字打出，无「已编辑」标记
- **@ 用户渲染**：AI 回复中可 @ 用户/所有人（原生 mention）
- **Bot 互 @ 对话**：`allowBots` 配置允许 bot 间对话

### 消息能力
- **多媒体收发**：图片/文件/音频/视频消息下载与发送
- **合并转发**：merge-forward 识别与展开
- **表情反馈感知**：用户 👍/❤️ 等表情反馈给 agent（需后台订阅事件）

### 飞书对象工具（MCP）
通过 Model Context Protocol 向 DSH 暴露 **40 个飞书工具**，agent 以 `mcp__feishu__*` 原生调用：

| 类别 | 工具 |
|---|---|
| 消息 | `send_message` `read_messages` `search_chats` `get_chat_members` |
| 文档 | `read_document` `create_document` |
| 日历 | `calendar_agenda` `create_calendar_event` |
| 任务 | `get_my_tasks` `create_task` |
| 多维表格 | `base_read_records` |
| 电子表格 | `sheets_read` |
| Wiki | `wiki_search` |
| 邮件 | `mail_list` `mail_send` |
| 云盘 | `drive_search` `drive_list_folder` |
| 妙记 | `minutes_search` |
| 审批 | `approval_list_todo` |
| 搜索 | `search_docs` |
| 文档扩展 | `update_document` `doc_insert_media` `doc_list_comments` |
| 任务扩展 | `task_create_subtask` `task_get_detail` `task_related` |
| 日历扩展 | `calendar_freebusy` |
| 消息扩展 | `search_messages` `read_thread_messages` |
| 知识库扩展 | `wiki_list_spaces` `wiki_create_node` |
| Base 扩展 | `base_create_field` `base_create_view` |
| 日历参会人 | `calendar_add_attendee` |
| 通讯录 | `get_user_info` |

### 平台能力
- **多账号多机器人**：一个进程管理多个飞书 bot，session 自动隔离
- **诊断自修复**：`npm run doctor`（19 项检查 + `--fix` 自动修复）
- **权限管理**：自动检测缺失权限并生成一键申请链接
- **工具追踪**：回复中展示 agent 执行的工具链

## 📦 安装

### 前置依赖
- [DSH](https://github.com/deepseek-ai)（DeepSeek Harness）
- [lark-cli](https://www.npmjs.com/package/@larksuite/cli)（飞书官方 CLI）
- Node.js ≥ 18

### 步骤

```bash
# 1. 克隆本项目
git clone <your-repo-url> dsh-lark-bridge
cd dsh-lark-bridge

# 2. 安装依赖
npm install

# 3. 配置飞书应用
#    在飞书开放平台创建应用, 启用机器人能力, 申请权限
#    配置方式见 docs/SETUP.md

# 4. 安装 DSH 持久会话插件
#    将 dsh-lark-session 复制到 DSH headless profile:
cp -r dsh-lark-session ~/.dsh/profiles/headless/node_modules/

# 5. 启动
npm start
# 或注册为常驻服务 (macOS):
cp com.dsh.lark-bridge.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dsh.lark-bridge.plist
```

## 🔧 配置

配置通过环境变量或 `config.json`（见 [config.example.json](config.example.json)）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `LARK_APP_ID` | — | 飞书应用 App ID |
| `LARK_APP_SECRET` | — | 飞书应用密钥 |
| `REQUIRE_MENTION` | `false` | 群聊是否要求 @ 才响应 |
| `ALLOW_BOTS` | `false` | bot 互 @：`false`/`true`/`mentions` |
| `GROUP_POLICY` | `open` | 群策略：`open`/`allowlist`/`closed` |
| `REACTION_NOTIFICATIONS` | `off` | 表情反馈：`off`/`own`/`all` |
| `TYPING_CHUNK_MS` | `250` | 卡片打字机间隔 |
| `DSH_BIN` / `DSH_HOME` | — | DSH 路径 |

## 🚀 使用

- **私聊**：直接在飞书单聊机器人
- **群聊**：拉机器人进群, 直接发消息（或 @ 取决于配置）
- **话题**：在群消息上创建话题, 独立上下文
- **飞书工具**：告诉 agent "查日程 / 读文档 / 发消息给 XX"

### 管理命令

```bash
npm start        # 启动
npm run doctor   # 诊断 (--fix 自动修复)
npm test         # 运行测试 (29 用例)
npm run mcp      # 单独运行 MCP server
```

## 🏗️ 架构

```
飞书 App ──SDK WSClient──▶ bridge (src/index.js)
                              │  policy: 群策略/@/白名单/bot
                              │  media: 多媒体下载
                              │  merge-forward: 合并转发展开
                              ▼
                        DSH 持久会话 runner (agents.resume)
                              │  mcp__feishu__* 工具调用
                              ▼
                   卡片流式回复 + 表情 + @ 渲染
```

详细架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，路线图见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 📁 项目结构

```
src/
├── index.js              # 入口 (多账号)
├── config.js             # 配置管理
├── channel.js            # 飞书通道 (SDK)
├── session.js            # 持久会话
├── core/
│   └── scope-manager.js  # 权限管理
├── inbound/
│   ├── policy.js         # 群策略/bot/@
│   ├── media.js          # 多媒体接收
│   ├── reaction.js       # 表情反馈
│   ├── merge-forward.js  # 合并转发
│   └── comment.js        # 文档评论@
├── outbound/
│   └── mention.js        # @渲染
├── tools/
│   └── mcp-server.js     # 飞书 MCP server (20 工具)
└── commands/
    └── doctor.js         # 诊断自修复
tests/                    # 29 个单元测试
docs/                     # 文档
```

## 📄 License

MIT

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) 及 [飞书官方插件](https://github.com/larksuite/openclaw-lark)
- [@larksuite/channel](https://www.npmjs.com/package/@larksuite/channel) SDK
