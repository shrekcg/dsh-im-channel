# 第二轮代码审阅报告（2026-08-15）

> 本轮审阅聚焦：**真流式输出正确性、并发安全、资源管理、功能回归**。
> 两个审阅子 agent 因运行环境问题未能产出结论，由主 agent 完成等效深度自查。

## 审阅发现并修复的问题（4 项）

### 🔴 1. 身份门禁回归：破坏 create_document 等写操作（已修复 `0777935`）
- **位置**：`src/tools/mcp-server.js` larkJson 身份策略
- **问题**：此前修复 #5 时"所有写操作一律降级 bot"，导致 `docs +create`、`calendar +create`、`task 创建` 等**需要 user 身份**的工具全部失效（bot 无法创建用户私有文档）
- **修复**：仅"冒充用户对外发声"类（`im +messages-send` / `mail +send`）强制 bot；文档/日历/任务创建保持 user
- **验证**：create_document 正常（返回文档 URL）、send_message 正常（bot 身份发送成功）

### 🟠 2. withSessionLock 队列泄漏（已修复 `1d45d7d`）
- **位置**：`src/session.js` withSessionLock
- **问题**：`sessionQueues.set(sessionId, next.catch(...))` 存入的是 catch 后的新 Promise，finally 里比较的是 `next` → **Map 条目永不删除，每个 sessionId 泄漏**（长期运行内存增长）
- **修复**：守卫 Promise 方案，任务只执行一次，finally 正确清理
- **验证**：串行/复用/失败恢复测试通过

### 🟡 3. appendCardFooter 缺 element_id（已修复 `1aa3add`）
- **位置**：`src/channel.js` appendCardFooter
- **问题**：updateCard 整卡替换流式卡片时缺 `element_id`（SDK 用 `stream_md`），飞书更新校验可能失败
- **修复**：markdown 元素补 `element_id: 'stream_md'`

### 🟡 4. 真流式 runPromise 失败时消费泄漏（已修复 `098a34a`）
- **位置**：`src/index.js` 生产-消费
- **问题**：`await runPromise` 若抛错（DSH 崩溃），consumePromise 永不收尾 → SDK 卡片挂起/连接泄漏
- **修复**：try/finally 保证 deltaDone=true + consumePromise catch 收尾

## 审阅确认无问题（未发现 bug）

- runner 的 `ctx.on("session/event")` 订阅：whenIdle 后正确 off()，无泄漏；`event.seq < firstSeq` 过滤历史，不重放
- delta 生产-消费：无死锁（runPromise 完成后 deltaDone=true，消费循环取完剩余），自适应步长边界正确
- 多账号 channel 隔离：appId 作缓存 key，天然隔离
- run() detached 进程组击杀：超时正确杀进程树，正常完成退出码 0
- processedMessageIds TTL 清理：>5000 才清，24h TTL，无泄漏
- MCP 身份门禁正则：读写分类正确（本轮修复后）
- 自适应步长：短6字/中16字/长40字，边界测试覆盖（59 全过）

## 测试与验证状态

```
59 单元测试 ✅  doctor 21 项 ✅  服务运行 ✅  GitHub 同步 ✅
流式实测: 短内容(44B) / 长内容(1012字符) 均正常流式 + footer 小字
```

## 结论

当前项目成熟度相较首次审查（4/10）显著提升。本轮修复的**身份门禁回归**是最重要发现——它证明"修复引入回归"的风险真实存在，后续改动需保持测试覆盖。剩余改进方向（非 bug）：真流式的思考内容展示、长会话性能、MCP 工具分页等，已记入 ROADMAP。
