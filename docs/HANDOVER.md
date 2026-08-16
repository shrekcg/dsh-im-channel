# dsh-lark-bridge 项目交接文档

> 最后更新：2026-08-16
> 用途：供后续会话 / 其他 agent 快速了解项目全貌，无缝接手。

---

## 一、项目是什么

**DSH ↔ Feishu/Lark Bridge** — 把 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH，AI Agent 运行时）接入飞书/Lark 的**双向通道插件**。

- **GitHub**：https://github.com/shrekcg/dsh-lark-bridge （公开仓库，48 commits，MIT）
- **定位**：对齐 [OpenClaw 飞书官方插件](https://github.com/larksuite/openclaw-lark) 的能力与体验，但基于 DSH 生态构建

## 二、当前状态（已验证）

```
73 单元测试全过 ✅    doctor 21 项全过 ✅    CI 全绿 ✅
bridge 服务运行 (pid 2893, launchd: com.dsh.lark-bridge) ✅
web 应用运行 (pid 1568, DSH Web GUI: http://127.0.0.1:3080) ✅
Git 工作区干净 ✅    最近提交: 648c742
```

## 三、核心功能清单

| 功能 | 位置 | 说明 |
|---|---|---|
| **真流式输出** | `dsh-lark-session/lib/index.js`, `src/core/pacing.js`, `src/channel.js` | runner 边生成边输出 delta 流（NDJSON），bridge 生产-消费队列实时推送到飞书卡片；自适应节奏（短2字/45ms、中3字/40ms、长4字/35ms）；底部小字 footer「✅ 已完成 · 耗时 xx」 |
| **持久会话** | `src/session.js` | 固定 session + DSH `agents.resume`；per-session 互斥锁（`withSessionLock` 守卫 Promise 方案） |
| **40 个飞书 MCP 工具** | `src/tools/mcp-server.js` | lark-cli 执行后端；agent 以 `mcp__feishu__*` 调用；身份门禁（发消息/邮件强制 bot，文档/日历创建保持 user） |
| **斜杠命令** | `src/commands/slash.js` | `/help` `/new` `/clear` `/compact` `/model` `/status` `/state` `/tools` `/features` `/doctor`；消息进入 DSH 前拦截，即时响应不消耗 AI 调用 |
| **渠道状态展示** | `src/http-status.js`, `src/core/status.js` | HTTP 状态页 `http://127.0.0.1:8899`；`GET /api/status` JSON、`POST /api/check`、`POST /api/remove`；渠道列表（飞书+预留钉钉/QQ/微信） |
| **DSH 设置页 IM 机器人 tab** | `web-plugin/lib/client.js` | DSH Web 设置页「插件」新增「IM 机器人」tab（`settings.plugins.tab` slot），fetch 8899 渲染渠道状态；ModuleLoader 格式手写，无需构建 |
| **功能清单** | `src/commands/features.js` | `npm run features` 固定模板标准答案（确定性判断，不靠模型推断） |
| **诊断自修复** | `src/commands/doctor.js` | `npm run doctor` 21 项检查 + `--fix` 自动修复 |
| 多媒体/表情反馈/合并转发/群策略/多账号/CORS | `src/inbound/*`, `src/index.js` | 图片文件收发、👍❤️ 反馈、merge-forward 展开、群白名单/仅@、多账号 session 隔离 |

## 四、架构

```
┌──────────────────────────────────────────────────┐
│                     飞书 / Lark                   │
└───────────────────────┬──────────────────────────┘
                        │ WebSocket 长连接 (@larksuite/channel SDK)
┌───────────────────────▼──────────────────────────┐
│               bridge (launchd 常驻进程)            │
│  src/index.js — 消息流水线 + 斜杠命令 + 真流式     │
│  src/channel.js — SDK 封装 (流式/表情/footer)      │
│  src/session.js — 持久会话 + 互斥锁               │
│  src/http-status.js — 8899 状态服务 (CORS)        │
└───────────────────────┬──────────────────────────┘
                        │ spawn DSH headless
              ┌─────────▼──────────┐
              │ DSH --patch         │
              │ dsh-lark-session    │ (持久会话 runner + delta 流)
              │ + mcp-feishu client │ (mcp__feishu__* 40 工具)
              └─────────┬──────────┘
                        │ lark-cli 执行后端
              ┌─────────▼──────────┐
              │  飞书 OpenAPI       │
              └────────────────────┘

web-plugin/ → DSH Web GUI 设置页「IM 机器人」tab → fetch 8899
```

## 五、插件市场与推广（进行中）

### 已完成
- **PR #1114** 提交到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1114)（DSH 官方插件市场）：OPEN + MERGEABLE + CI 全绿（Submission gate pass + check pass），已评论催办
- **市场收录要求全部满足**：`dsh.bundle` manifest（根 `cordis.patch.yml` + `src/plugin.js` cordis 包装）、49 commits、`dsh-plugin` topic、真实代码
- **npm 发布准备完成**：包名改为 `dsh-feishu-channel`（`dsh-lark-bridge` 被 leo-lab-2026 占用）；完善 repository/homepage/files/publishConfig；`npm pack` 验证通过（58.5kB/36 文件）
- README 已加市场徽章（中英）：`[![Market](...awesome-dsh-plugin.com/p/shrekcg/dsh-lark-bridge/...)]`
- `docs/MARKET.md` 上架指南 + `docs/PROMO.md` 中英推广文案

### 待办（外部依赖）
| 项 | 阻塞条件 | 操作 |
|---|---|---|
| PR #1114 合并 | 维护者处理中（合并快，当天合 5+ 个） | 等待 / 再次催办 |
| **npm publish** | **需要用户 `npm login`**（当前 ENEEDAUTH） | 登录后执行 `npm publish` |
| 市场可见验证 | PR 合并后 | 验证 `https://awesome-dsh-plugin.com/p/shrekcg/dsh-lark-bridge/` |
| 截图提交 | 已生成 `docs/screenshots/status-page.png`（82KB，未验证内容） | 建议更新 PR body 加 Screenshots 部分（维护者常要求） |

## 六、环境事实（重要）

- **项目路径**：`/Users/Wcg/Desktop/AI /deepseek-harness/dsh-lark-bridge`（**路径含空格**，cd 需转义）
- DSH 安装：`/Users/Wcg/.local/share/agent-cli/dsh-0.1.0-rc.6/`
- `dsh` 二进制：`/Users/Wcg/.local/bin/dsh`（**PATH 可能丢，用绝对路径**）
- lark-cli：`/opt/homebrew/bin/lark-cli`（env 需 `LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1` / `LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1`）
- 飞书应用：App ID `cli_aaf452591cb8dcff`，bot「大鲸鱼」（openId `ou_d952fe58ab33e3c3039c3f710318ee9e`），用户 Shrekwu（`ou_df4ceebe3cda57fbdb04c6d7e1a71aa2`）
- 测试群：`oc_317998be1f09f77f0e6154d03dc2a714`；P2P 聊天 `oc_dc8452ec3e725ef31b569df27bd67c52`
- launchd：`com.dsh.lark-bridge`（bridge，plist 在 `~/Library/LaunchAgents/`）、`com.wcg.dsh.web`（web GUI，cloudflared tunnel）
- **安全**：git 历史曾泄露 appSecret（已 filter-branch 清理 + force push）；仓库 plist 模板用占位 `__LARK_APP_SECRET__`，本机 launchd plist 仍有实际 secret
- 子 agent 审阅曾因环境卡住（无输出，运行数轮不产出）——需注意超时，必要时主 agent 自查代替

## 七、技术要点备忘

- **SDK**：`@larksuite/channel` v0.5.0（WSClient 收消息；`stream()` 卡片流式；Throttle 双阈值）
- **真流式关键**：SDK `streamThrottleChars=3`（每次 append 立即 PATCH 小块）+ 消费端 `pacing.takeChunk`（2-4字/35-45ms）；SDK 默认 50字符/100ms 会跳大段
- **身份门禁**：仅 `im +messages-send` / `mail +send` 强制 bot，文档/日历/任务创建保持 user（防止误伤功能）
- **会话锁**：`withSessionLock` 用守卫 Promise（曾修 Map 永不删除泄漏 bug）
- **MCP server**：stdio 协议，无 stdin 会退出（CI 验证用 MCP client 连接而非进程存活检查）
- **跑测试**：`node --test tests/*.test.js`（73 个）
- **重启 bridge**：`launchctl bootout gui/$(id -u)/com.dsh.lark-bridge && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dsh.lark-bridge.plist`
- **流式实测**：长内容（1000+字）22.5s 完整流式 + footer；短内容（44B）正常

## 八、管理命令速查

```bash
npm start                # 启动 bridge
npm run setup            # 初始化向导 (6 步)
npm run doctor           # 诊断 (21 项, --fix 自动修复)
npm run features         # 功能配置清单
npm run install-bridge   # 安装插件 + 常驻服务
npm run uninstall-bridge # 卸载 (可逆)
npm test                 # 73 个单元测试
npm run mcp              # 单独运行 MCP server
```

## 九、建议的下一步（接手后优先级）

1. **npm publish**：让用户 `npm login`，然后 `npm publish`（发布 `dsh-feishu-channel`，一键安装）
2. **PR #1114 合并推进**：检查状态；合并前把截图（`docs/screenshots/status-page.png`）提交/更新到 PR body 的 Screenshots 部分
3. **合并后**：验证市场页可见 → 更新 README 徽章实际生效 → 在 DSH 社区分享（`docs/PROMO.md` 文案）
4. 可选：真流式的思考内容展示、MCP 工具分页、长会话性能（记于 ROADMAP）
