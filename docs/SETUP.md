# 部署指南 (SETUP)

## 一、飞书开放平台配置

1. 登录 [飞书开放平台](https://open.feishu.cn/app)，创建**企业自建应用**
2. **应用能力** → 启用**机器人**
3. **权限管理** → 按需开通权限（推荐批量导入，见下方 JSON）
4. **事件与回调** → 添加事件订阅（长连接方式）：
   - `im.message.receive_v1`（消息接收，必需）
   - `im.message.reaction.created_v1`（表情反馈，可选）
   - `im.message.reaction.deleted_v1`（表情移除，可选）
   - `drive.notice.comment_add_v1`（文档评论@，可选）
5. **版本管理与发布** → 创建版本并发布（可用范围包含你自己）

### 推荐权限清单（JSON 批量导入）

在权限管理 → 批量导入/导出权限 → 导入：

```json
{
  "scopes": {
    "tenant": [
      "im:message:send_as_bot",
      "im:message:readonly",
      "im:message.p2p_msg:readonly",
      "im:message:recall",
      "im:message.pins:read",
      "im:message.pins:write_only",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "im:resource",
      "im:chat:read",
      "im:chat:update",
      "im:chat.members:read",
      "im:chat.members:write_only",
      "cardkit:card:write",
      "cardkit:card:read",
      "contact:user.base:readonly",
      "docx:document:readonly",
      "docx:document:create",
      "docx:document:write_only",
      "drive:drive.metadata:readonly",
      "calendar:calendar:read",
      "calendar:calendar.event:read",
      "calendar:calendar.event:create",
      "task:task:read",
      "task:task:write",
      "base:record:read",
      "sheets:spreadsheet:read",
      "wiki:node:read",
      "mail:user_mailbox:readonly",
      "minutes:minutes:readonly",
      "approval:instance:read"
    ],
    "user": [
      "contact:user.base:readonly",
      "contact:user:search",
      "offline_access"
    ]
  }
}
```

> 提示：也可以直接用 lark-cli 一次性授权：`lark-cli auth login --domain all`（用户身份）。

## 二、DSH 持久会话插件安装

```bash
# 将 dsh-lark-session 插件放入 DSH headless profile
mkdir -p ~/.dsh/profiles/headless/node_modules/
cp -r dsh-lark-session ~/.dsh/profiles/headless/node_modules/
```

插件已配置：
- 持久会话 runner（`agents.resume`）
- 飞书 MCP client（`mcp-feishu`）

## 三、Bridge 配置

### 方式 A: 环境变量（单账号，推荐）

```bash
export LARK_APP_ID="cli_xxx"
export LARK_APP_SECRET="xxx"
export REQUIRE_MENTION="false"
npm start
```

### 方式 B: config.json（多账号/复杂配置）

复制 `config.example.json` 为 `config.json` 并按需修改。

## 四、常驻服务 (macOS launchd)

```bash
# 修改 plist 中的路径为你的实际路径
cp com.dsh.lark-bridge.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dsh.lark-bridge.plist

# 查看状态
launchctl list | grep dsh.lark-bridge

# 日志
tail -f bridge.log
```

## 五、验证

```bash
# 1. 诊断
npm run doctor

# 2. 测试
npm test

# 3. 飞书对话
# 私聊机器人发消息 → 应收到卡片流式回复
# 群里拉机器人 → 直接发消息（或 @ 取决于配置）
# 发"查今天的日程" → agent 调用日历工具
```
