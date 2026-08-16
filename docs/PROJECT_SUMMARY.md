# DSH ↔ Feishu/Lark Bridge 项目总结

> 本文档是对整个项目的完整梳理，供后续回顾、维护、推广使用。
> 最后更新：2026-08-15

---

## 一、项目是什么

**DSH ↔ Feishu/Lark Bridge** 是一个把 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH，AI Agent 运行时）接入飞书/Lark 的**完整双向通道插件**。用户可以在飞书里像使用原生对话一样与 DSH agent 交互：私聊、群聊、话题，agent 能调用 40 个飞书对象工具直接操作飞书（文档/表格/日历/任务/消息等），并支持持久记忆、流式卡片回复、思考过程展示等完整体验。

**定位**：对齐 OpenClaw 飞书官方插件（[larksuite/openclaw-lark](https://github.com/larksuite/openclaw-lark)）的能力，但基于 DSH 而非 OpenClaw。

---

## 二、架构

### 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                      飞书 / Lark                        │
│  用户私聊 · 群聊 · 话题 · 文档评论 · 表情反馈 · 卡片交互   │
└─────────────────────────┬───────────────────────────────┘
                          │ WebSocket 长连接 (SDK WSClient)
                          │ + REST API (发送/工具)
┌─────────────────────────▼───────────────────────────────┐
│              bridge (常驻进程, launchd 管理)              │
│  ┌─────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │ channel │  │  inbound   │  │     outbound       │    │
│  │ (SDK)   │  │ policy     │  │ stream (卡片流式)   │    │
│  │         │  │ media      │  │ mention (@渲染)     │    │
│  │         │  │ reaction   │  │ thinking (思考折叠) │    │
│  │         │  │ merge-fw   │  │ footer (耗时)      │    │
│  │         │  │ comment    │  │                    │    │
│  └────┬────┘  └────┬───────┘  └────────┬───────────┘    │
│       │      ┌─────▼──────┐            │                │
│       │      │  session   │            │                │
│       │      │ (agents.   │            │                │
│       │      │  resume)   │            │                │
│       │      └─────┬──────┘            │                │
└───────┼────────────┼───────────────────┼────────────────┘
        │            │                   │
        │     ┌──────▼──────┐            │
        └────▶│ DSH headless│◀───────────┘
              │  (持久会话)  │
              │  + MCP client│
              └──────┬──────┘
                     │ mcp__feishu__* (40 工具)
              ┌──────▼──────┐
              │ Feishu MCP  │
              │ server      │
              └──────┬──────┘
                     │ lark-cli (执行后端)
              ┌──────▼──────┐
              │  飞书 OpenAPI│
              └─────────────┘
```

### 三个关键设计决策

1. **接收：SDK WSClient 长连接**（`@larksuite/channel`）
   - 获得完整事件字段：`chatType`/`mentionedBot`/`mentionAll`/`threadId`/`rootId`/`isBot`/`resources`
   - 无需公网回调地址（对比 webhook 方式）

2. **会话：固定 session + DSH `agents.resume`**
   - 每个"对话上下文"一个固定 session id，跨消息保持记忆
   - 话题/群/私聊/多账号 完全隔离

3. **工具：MCP (Model Context Protocol)**
   - DSH 原生支持 `dsh-mcp-client` 插件
   - 40 个飞书工具实现为独立 MCP server（stdio），agent 以 `mcp__feishu__*` 调用
   - 执行后端是 lark-cli（稳定可靠，已验证 40 个命令）

### 会话隔离模型

| 场景 | session id | 说明 |
|---|---|---|
| P2P 私聊 | `feishu-<openId>` | 每用户一条主线 |
| 群聊主线 | `feishu-g-<chatId>-<openId>` | 每群每人一条 |
| 话题消息 | `feishu-g-<chatId>-thread-<threadId>` | 每话题完全独立（fork） |
| 多账号 | `acc-<accountId>-feishu-...` | 账号间隔离 |

---

## 三、功能清单

### 对话体验层（7 项）
| 功能 | 说明 |
|---|---|
| 持久会话 | 跨消息上下文记忆（agents.resume） |
| 话题隔离 | 每个话题独立上下文 |
| 群聊策略 | 4 种模式 + 按群细粒度 + 白名单 |
| THINKING 表情 | 收到→出现，回复→移除 |
| 卡片流式打字机 | 无「已编辑」标记 |
| 思考过程折叠 | 💭 details 折叠块 |
| Bot 互 @ | allowBots 配置 |

### 消息能力层（6 项）
| 功能 | 说明 |
|---|---|
| 多媒体收发 | 图片/文件/音频/视频 |
| 合并转发 | merge-forward 识别展开 |
| 表情反馈 | 👍/❤️ 反馈给 agent |
| @ 用户渲染 | 原生 mention |
| 工具追踪 | 🔧 已执行工具链 |
| 文档评论@ | 评论中@机器人 |

### 工具层（40 个 MCP 工具）
| 类别 | 工具 |
|---|---|
| 消息 | send_message, read_messages, search_chats, get_chat_members, search_messages, read_thread_messages |
| 文档 | read_document, create_document, update_document, doc_insert_media, doc_list_comments |
| 日历 | calendar_agenda, create_calendar_event, calendar_freebusy, calendar_search_events, calendar_add_attendee |
| 任务 | get_my_tasks, create_task, task_create_subtask, task_get_detail, task_related, task_add_comment |
| 多维表格 | base_read_records, base_create_table, base_create_record, base_create_field, base_create_view |
| 表格 | sheets_read |
| Wiki | wiki_search, wiki_list_spaces, wiki_create_node |
| 邮件 | mail_list, mail_send |
| 云盘 | drive_search, drive_list_folder |
| 妙记 | minutes_search |
| 审批 | approval_list_todo |
| 搜索 | search_docs |
| 通讯录 | get_user_info |
| 交互 | ask_user_question |

### 平台能力层（5 项）
| 功能 | 说明 |
|---|---|
| 多账号多机器人 | accounts 配置，session 隔离 |
| doctor 诊断 | 19 项检查 + --fix 自动修复 |
| 权限管理 | scope-manager 自动检测缺失权限 |
| 会话压缩 | DSH 原生 compaction |
| 初始化向导 | setup.js 6 步引导 |

---

## 四、限制与已知问题

### 功能限制
1. **只处理文本消息**：图片/文件消息已支持收发，但 agent 目前对图片内容的**理解有限**（下载保存但无法 OCR/视觉理解，取决于 DSH 模型能力）
2. **每次消息独立 DSH 进程**：bridge 通过 spawn `dsh headless` 处理，有启动开销（约 5-30s，取决于会话大小）
3. **后台事件订阅依赖手动配置**：reaction/comment/card.action 三个事件需要用户在开发者后台添加
4. **卡片回调入口特殊**：`card.action.trigger` 是"回调"不是"事件"，在后台不同区域配置

### 已知问题
1. **MCP server 偶发连接挂起**：极少数情况下 DSH 连接 MCP server 会超时（重试即恢复，已观测）
2. **长会话膨胀**：开发测试会话 seq 达数万后处理变慢，DSH compaction 会自动触发但摘要耗时
3. **`my.feishu.cn` 域名**：lark-cli 返回的 URL 用 my.feishu.cn，个别客户端可能显示异常（已改用标准域名拼接）
4. **表情/评论/卡片回调**：需要后台事件订阅激活，未订阅时功能静默不可用

### 安全注意
- `config.json` 含 appSecret，已加入 .gitignore
- 以 user 身份操作时，AI 可能以你的名义执行写入操作，需注意"先预览再确认"

---

## 五、使用场景

### 适合的场景
1. **个人 AI 助手**：飞书里随时对话，查日程/读文档/管任务/发消息
2. **团队机器人**：拉入群聊，群内问答、信息查询、通知推送（需配置群策略）
3. **自动化工作流**：agent 通过 40 个工具操作飞书全家桶（文档/表格/Base/日历/任务）
4. **跨渠道统一入口**：DSH 的能力通过飞书暴露，手机上也能用

### 不适合的场景（当前版本）
1. **高并发群聊**：大群里所有消息都回复会刷屏（默认 requireMention=false 慎用）
2. **实时流式渲染**：当前是"处理完→卡片打字机播放"，不是真·token 级流式
3. **多模态理解**：图片/语音的理解依赖 DSH 模型能力，非本项目可解
4. **企业级权限治理**：无 RBAC/组织架构同步（对比 OpenClaw 的 groupPolicy 白名单模式仍简单）

---

## 六、上线状态

| 项 | 状态 |
|---|---|
| **GitHub** | ✅ https://github.com/shrekcg/dsh-im-channel （公开） |
| **版本** | 0.2.0（首个开源版） |
| **License** | MIT |
| **测试** | 44 个单元测试全部通过 |
| **诊断** | doctor 21 项全部通过 |
| **运行** | 本地 launchd 常驻（com.dsh.lark-bridge） |
| **工具** | 40 个 MCP 工具，命令全部验证 |
| **文档** | README（中/英）、ARCHITECTURE、SETUP、INSTALL、CHANGELOG、CONTRIBUTING |
| **待办** | 后台事件订阅（reaction/comment/card.action）；改公开仓库；npm 发布 |

---

## 七、技术栈

| 组件 | 用途 |
|---|---|
| Node.js (≥18) | 运行环境 |
| @larksuite/channel | 飞书官方 SDK（收发一体） |
| @larksuite/cli (lark-cli) | 飞书 CLI（工具执行后端） |
| @modelcontextprotocol/sdk | MCP server 实现 |
| DSH headless profile | agent 运行时（持久会话） |
| dsh-mcp-client | DSH 侧 MCP 客户端插件 |
| launchd | macOS 常驻服务 |

---

## 八、开发历程

1. **2026-08-14**：初始版本（SDK WSClient 收发 + 持久会话）
2. **2026-08-15**：模块化重构 → 多媒体 → 表情 → 合并转发 → 工具追踪 → MCP 工具 → 多账号 → doctor → 权限管理 → 思考显示 → 交互提问 → 插件化 → 初始化向导 → GitHub 发布
3. 全程对齐 OpenClaw 飞书插件（源码参考 larksuite/openclaw-lark）

---

## 九、后续规划

- [ ] 后台事件订阅激活验证（reaction/comment/card.action）
- [ ] 仓库改公开 + 补充 README 徽章
- [ ] npm 发布（`dsh-im-channel`）
- [ ] 真·流式输出（token 级）
- [ ] 图片视觉理解（依赖 DSH 多模态模型）
- [ ] 企业级群权限治理（RBAC）
- [ ] CI（GitHub Actions 跑测试）
