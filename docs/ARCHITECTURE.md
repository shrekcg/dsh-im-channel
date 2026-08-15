# 架构文档

## 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                      飞书 / Lark                        │
│  用户私聊 · 群聊 · 话题 · 文档评论 · 表情反馈            │
└─────────────────────────┬───────────────────────────────┘
                          │ WebSocket 长连接 (SDK WSClient)
                          │ + REST API (发送/工具)
┌─────────────────────────▼───────────────────────────────┐
│                    bridge (src/)                        │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ channel │  │  inbound │  │      outbound        │   │
│  │ (SDK)   │  │ policy   │  │ stream (卡片流式)    │   │
│  │         │  │ media    │  │ mention (@渲染)      │   │
│  │         │  │ reaction │  │                      │   │
│  │         │  │ merge-fw │  │                      │   │
│  │         │  │ comment  │  │                      │   │
│  └────┬────┘  └────┬─────┘  └──────────┬───────────┘   │
│       │            │                   │               │
│       │      ┌─────▼─────┐             │               │
│       │      │  session  │             │               │
│       │      │ (agents.  │             │               │
│       │      │  resume)  │             │               │
│       │      └─────┬─────┘             │               │
└───────┼────────────┼───────────────────┼───────────────┘
        │            │                   │
        │     ┌──────▼──────┐            │
        └────▶│ DSH headless│◀───────────┘
              │  (持久会话)  │
              │  + MCP client│
              └──────┬──────┘
                     │ mcp__feishu__*
              ┌──────▼──────┐
              │ Feishu MCP  │
              │ server      │
              │ (20 工具)   │
              └──────┬──────┘
                     │ lark-cli
              ┌──────▼──────┐
              │  飞书 OpenAPI│
              └─────────────┘
```

## 核心设计决策

### 1. 接收通道: SDK WSClient
使用 `@larksuite/channel` 的 WSClient（官方事件通道），获得完整事件字段：
`chatType`、`mentionedBot`、`mentionAll`、`threadId`、`rootId`、`isBot`、`resources`。
这些是群聊策略、话题隔离、bot互@、多媒体处理的基础。

### 2. 会话模型: 固定 session + agents.resume
DSH 原生 `agents.resume` 加载持久化会话。每个"对话上下文"一个固定 session id：

| 场景 | session id | 说明 |
|---|---|---|
| P2P 私聊 | `feishu-<openId>` | 每用户一条主线 |
| 群聊主线 | `feishu-g-<chatId>-<openId>` | 每群每人一条 |
| 话题消息 | `feishu-g-<chatId>-thread-<threadId>` | 每话题完全独立 |
| 多账号 | `acc-<accountId>-feishu-...` | 账号间隔离 |

### 3. 工具面: MCP (Model Context Protocol)
DSH 原生支持 `dsh-mcp-client` 插件。飞书对象工具实现为独立 MCP server（stdio），
DSH agent 以 `mcp__feishu__<name>` 原生调用。执行后端为 lark-cli（稳定可靠）。

### 4. 发送面: 卡片流式
- `stream()` 卡片打字机：分块 append，卡片整体替换（无「已编辑」标记）
- `addReaction`/`removeReaction`：THINKING 表情生命周期

### 5. 配置: 环境变量 + config.json
- 环境变量适合单账号简单部署
- `config.json` 支持多账号、按群策略等复杂配置
- doctor 可从 launchd plist 读取环境变量

## 数据流

### 消息处理流水线
```
message 事件 → policy 判断 → 内容构造 (文本+媒体+合并转发)
  → THINKING 表情 → DSH 持久会话 → 工具调用 (MCP)
  → 卡片流式回复 → 移除表情
```

### 表情反馈
```
reaction 事件 → 匹配最近消息上下文 → 构造反馈消息
  → 同一会话 agent 感知 → 可选回复
```

### 文档评论
```
comment 事件 (@bot) → 构造评论上下文 → DSH 处理 → 评论回复
```

## 可扩展性

- **新工具**：在 `mcp-server.js` 添加 `server.tool(...)`，MCP 自动注册
- **新消息类型**：在 `inbound/` 添加处理器
- **新账号**：在 `config.json` 的 `accounts` 添加
- **新渠道策略**：扩展 `policy.js`
