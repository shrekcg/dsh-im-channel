# 代码审计报告（QWEN3.8-Max 独立审计）

> 审计时间：2026-08-20
> 审计模型：qwen3.8-max（带深度推理）
> 方法：独立逐文件通读 + 与 GLM5.2 审计交叉验证 + 88 测试实测
> 结论：成熟度 5.5/10 —— 飞书路径打磨扎实，但**不是文档宣称的多渠道统一通道**，且存在可移植性/鉴权回归问题。

---

## 关键发现

### 🔴 回归（上轮修复制造）
- **R1 /api/remove 鉴权回归**：加了 token 鉴权，但 HTTP 状态页与 web 设置页的"移除接入"按钮**都不发 token → 永久 403**。测试是内联复制逻辑（没测真实 handler），所以漏网。

### 🔴 可移植性（最大集成阻碍）
- **R2 plist 硬编码 /Users/Wcg**：`com.dsh.lark-bridge.plist` 的 DSH_HOME/DSH_BIN/HOME/PATH 四组 env 硬编码本机，install.js 只重写桥目录路径、**不重写这些** → 换台机器必半坏。
- **R3 7 处硬编码 /opt/homebrew/bin/lark-cli**：setup.js 还把它当前置门槛。

### 🟠 完整性/误导
- **R4 钉钉标"✅ 支持"但 connect() throw "未实现"**，QQ/微信/WhatsApp 连适配器都没有——README 与实际不符。
- **R5 Slack/Discord 无依赖时静默降级"只能发不能收"，且状态页谎报"在线"**。

### 🟠 安全
- **R6 /model 越权**：任何被放行用户可改写全局 settings.yaml。

### 🟠 测试质量
- **R7 88 测试"测自己"**：核心链路（index.js / http-status 真实 handler / runSession 子进程 / MCP 40 工具）零覆盖；含一处 `|| true` 恒真假断言。

---

## 修复清单（按阻碍集成程度排序）

1. R1 修 /api/remove UI 按钮发 token（补 403 回归）
2. R2 plist env 可移植（install.js 重写 DSH_HOME/DSH_BIN/HOME/PATH）
3. R3 lark-cli 硬编码动态定位
4. R4 README 钉钉/QQ/微信标注与实际一致（诚实）
5. R5 Slack/Discord 无依赖时明确降级提示 + 状态不谎报
6. R6 /model 越权限制
7. R7 补关键集成测试 + 修假断言
8. 其它小事（死代码、文档）
