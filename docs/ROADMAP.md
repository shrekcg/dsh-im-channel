# DSH ↔ 飞书桥 Roadmap

对齐 OpenClaw 飞书插件（@larksuite/openclaw-lark v2026.7.9）能力，以正规开源项目标准落地。

## 完成状态

### ✅ 已实现并验证

| 功能 | 验证方式 | 日期 |
|---|---|---|
| 模块化架构 (src/config/channel/session/inbound/outbound) | 单元测试 + 全链路 | 2026-08-15 |
| 持久会话 (agents.resume, 跨消息记忆) | "小明/咖啡" 两轮验证 | 2026-08-15 |
| 话题独立 session (thread_id → 独立上下文) | 话题 seq 419→475→543 续接 | 2026-08-15 |
| 群聊支持 (requireMention=false 不@也响应) | 测试群验证 | 2026-08-15 |
| THINKING 表情 (出现+回复后移除) | 全链路日志 | 2026-08-15 |
| 卡片流式打字机 (无「已编辑」标记) | 卡片消息验证 | 2026-08-15 |
| 多媒体接收 (图片/文件下载到 media/) | SDK 测试 + 正式链路 | 2026-08-15 |
| 多媒体发送 (SDK sendMedia image/file/audio/video) | SDK 测试 | 2026-08-15 |
| 合并转发 (merge-forward) 识别与展开 | 单元测试 | 2026-08-15 |
| 工具调用追踪 (runner tools + 回复展示) | 全链路验证 (bash 工具追踪) | 2026-08-15 |
| 20 个飞书 MCP 对象工具 | DSH 端到端 (查日程/搜云盘/查用户) | 2026-08-15 |
| 多账号多机器人 (accounts + session 隔离) | 单账号验证 + 29 测试 | 2026-08-15 |
| 诊断与自修复 (doctor 19 项) | 全部通过 | 2026-08-15 |
| Bot 互相 @ 对话 (allowBots) | 单元测试 | 2026-08-15 |
| 文档评论 @ 机器人 (comment handler) | 代码完成 (待后台订阅) | 2026-08-15 |
| 权限自动申请 (scope-manager) | 23 个工具权限全开通 | 2026-08-15 |
| 会话压缩 (DSH 原生 compaction) | 确认 base 已内置 | 2026-08-15 |
| 单元测试框架 | 29 用例全部通过 | 2026-08-15 |
| 开源文档 (README/ARCHITECTURE/SETUP) | 已完成 | 2026-08-15 |

### 🟨 已实现代码待接入/验证

| 功能 | 状态 |
|---|---|
| 群策略模块 (policy.js: 4种模式+按群细粒度+白名单) | 代码完成, 已接入 index.js |
| @用户渲染 (mention.js: @user:xxx → 原生mention) | 代码完成, 已接入 index.js |
| 媒体下载 (media.js) | 代码完成, 已接入 index.js, 验证通过 |
| 表情反馈 (reaction.js: off/own/all 三模式) | 代码+测试完成, **需后台订阅 reaction 事件** |

### 🟥 待开发 (仅剩后台配置项, 非代码)

- [ ] 表情反馈后台事件订阅 (开发者后台添加 im.message.reaction.created_v1)
- [ ] 文档评论后台事件订阅 (开发者后台添加 drive.notice.comment_add_v1)
- [ ] 卡片回调后台事件订阅 (开发者后台添加 card.action.trigger)
- [ ] 合并转发真实用户场景验证
- [ ] 推送到 GitHub (待用户确认)

### ✅ 最新补充 (本轮)

- MCP 工具扩展至 36 个 (新增 task_add_comment/calendar_search_events/base_create_table/base_create_record/ask_user_question)
- 全部 36 个工具命令系统性验证通过 (修复 mail +send / wiki +space-list / base +data-query / drive files list / drive file.comments list / calendar +create / approval tasks query / wiki +node-list 等命令)
- ask_user_question 交互提问卡片: 发选项卡片 + cardAction 回调注入会话 (代码完成, 需订阅 card.action.trigger)

- 流式思考显示: runner 输出 thinking, bridge 日志记录 (验证通过)
- MCP 工具扩展至 26 个 (新增 update_document/task_create_subtask/search_messages/read_thread_messages/calendar_freebusy/doc_list_comments)
- 测试扩展至 34 个 (新增 config/comment/scopeApplyUrl 平台测试)
- 开发测试数据清理 (会话/日志/媒体), .gitignore 创建
- doctor env 修复 (spawnSync 补 env), 19 项全通过

### ✅ 多账号多机器人 (新)

- config.json 支持 `accounts` 多账号: 每个账号独立 appId/appSecret/策略
- channel.js 按 appId 缓存多实例, session 按账号前缀隔离 (acc-<id>-feishu-...)
- index.js 遍历 accounts 启动多实例监听
- 示例: config.example.json
- 验证: 单账号(default) 全链路正常, 26 测试通过

### ✅ MCP 飞书对象工具 (新)

基于 Model Context Protocol 的飞书对象工具, DSH agent 以 `mcp__feishu__*` 原生调用:

| 工具 | 功能 | 状态 |
|---|---|---|
| send_message | 发消息 | ✅ 验证 |
| read_messages | 读会话消息 | ✅ 验证 |
| get_user_info | 解析用户 open_id | ✅ 验证 |
| read_document | 读云文档 | ✅ |
| create_document | 建云文档 | ✅ |
| search_chats | 搜群 | ✅ |
| get_chat_members | 群成员 | ✅ |
| calendar_agenda | 日历日程 | ✅ **飞书全链路验证** |
| create_calendar_event | 建日程 | ✅ |
| get_my_tasks | 我的任务 | ✅ 验证 |
| create_task | 建任务 | ✅ |
| base_read_records | 多维表格记录 | ✅ |
| sheets_read | 电子表格读取 | ✅ |
| wiki_search | 知识库搜索 | ✅ |
| mail_list | 读邮件 | ✅ |
| mail_send | 发邮件 | ✅ |
| drive_search | 云盘搜索 | ✅ **DSH 调用验证** |
| drive_list_folder | 云盘文件列表 | ✅ |
| minutes_search | 妙记搜索 | ✅ |
| approval_list_todo | 审批待办 | ✅ |

**飞书全链路验证**: 通过飞书发"查今天的日程" → agent 调用 calendar_agenda → 回复结果到飞书, 附工具追踪。

### ⚠️ 已知问题

1. **长会话膨胀**: 主会话 (feishu-ou-...) 测试积累大量历史后 seq 达 2万+, DSH resume 处理变慢 (正常 6s → 图片+膨胀 100s)。需要 compaction 机制 (对齐 OpenClaw), 或定期重置开发测试会话。
2. **测试会话数据**: 开发期间的测试消息积累在正式会话中, 开源前需清理。

## 技术参考

- OpenClaw 飞书官方插件源码: github.com/larksuite/openclaw-lark (v2026.7.9)
- 官方使用指南: bytedance.larkoffice.com/docx/MFK7dDFLFoVlOGxWCv5cTXKmnMh
- 飞书适配设计参考: docs/feishu-adapter-design
