# 代码审计报告（GLM-5.2 深度审计）

> 审计时间：2026-08-20
> 审计模型：glm-5.2（带深度推理）
> 审计范围：dsh-im-channel 全套（src/、web-plugin/、dsh-lark-session/、scripts/、tests/）
> 方法：逐文件通读 + 与 DSH 官方客户端插件（task-board、plugin-inventory）交叉比对 + 85 测试实测

---

## 1. 总体评价

**成熟度：6.5 / 10**

一句话结论：**飞书主链路（长连接、持久会话、真流式、斜杠命令、40 MCP 工具、HTTP 状态页）实现完整且工程化程度不错，但「多渠道」能力名不副实——Telegram 全可用、Slack/Discord 半可用、钉钉纯骨架；存在 1 个真实安全漏洞（无鉴权本地 DoS）、1 个兼容性隐患（web 插件宿主半 ESM/CJS 错配）、若干逻辑缺陷与死代码。**

---

## 2. 问题清单

### 🔴 严重（必须修）

**S1｜web 插件宿主半 lib/index.js 用 CommonJS，但 package.json 声明 type:module → ESM 下加载必报错**
- 位置：`web-plugin/package.json:5` + `web-plugin/lib/index.js:1-14`
- 影响：web profile 加载该插件行失败，兼容性破坏
- 修复：宿主半改 ESM（`export const name` / `export function apply`）

**S2｜HTTP /api/remove 无鉴权 + CORS * → 任意网页可杀死 bridge（本地 DoS/CSRF）**
- 位置：`src/http-status.js:149`（`Access-Control-Allow-Origin: *`）、`:175-180`（`process.exit(0)`）
- 影响：恶意网页 fetch 即可停掉 bridge
- 修复：加 token + Origin 白名单 / 移除副作用端点

**S3｜dsh-lark-session/cordis.patch.yml 硬编码本机绝对路径（含空格）+ failOnStartupError:true → 不可移植**
- 位置：`dsh-lark-session/cordis.patch.yml:31-35`
- 影响：他人安装必然启动失败
- 修复：路径改配置/环境变量，去掉 failOnStartupError

**S4｜launchd plist WorkingDirectory 含空格 → getcwd: Operation not permitted（已实证）**
- 位置：`com.dsh.lark-bridge.plist`
- 影响：相对路径读写失败
- 修复：改无空格目录或 index.js 显式 chdir

### 🟠 中等（应该修）

- **M1 钉钉纯外壳**：boot 配置键错位（传 dingtalkBotToken 但适配器读 dingtalkAppKey）+ _poll 从不住收 → 双重失效
- **M2 Slack/Discord 半可用**：可选依赖未声明；Slack mentionedBot 用 username 而非用户 ID
- **M3 web 插件 inject 过度声明** + build 脚本引用不存在
- **M4 cardAction 丢 thread/rootId** → 群话题问答进主线程
- **M5 Telegram _lastChatId 全局竞态**
- **M6 Telegram sendText parse_mode 失败**
- **M7 checkToolScopes fail-open**（权限查询失败放行）

### 🟡 轻微（建议修）

- Y1 死代码：adaptive.js imported 从未调用；与 pacing.js 重复
- Y2 死代码：status.updateChannel 无调用方；scope-manager.applyScopes 未实现
- Y3 死代码：doctor.js 死 require('plist')
- Y4 web Tab i18n 硬编码中文
- Y5 session.js 与 config.js larkSessionPatch 重复计算
- Y6 HTTP renderPage HTML 未转义（内��数据，低危）
- Y7 未显式声明 zod 依赖
- Y8 bridge.log/err.log 被提交进仓库

---

## 3. 兼容性专项

- 客户端 Tab 的 ModuleLoader 格式与 `settings.plugins.tab` 槽注入**正确**（与官方插件一致）——这是审计的重要正面确认
- 宿主半 ESM/CJS 错配是唯一兼容性破坏（S1）
- dsh-lark-session 的 cordis.patch 结构正确，仅 MCP 路径不可移植（S3）
- 渠道注册表与适配器文件一一对应，但能力一致性断裂（钉钉/Slack/Discord 名不副实）

## 4. 完整性专项（未闭环/外壳）

1. 钉钉：纯外壳，收不到消息
2. Slack：无依赖降级仅发送
3. Discord：无依赖降级仅发送
4. Telegram 媒体：未实现 downloadMedia → 图片/语音被丢弃
5. /compact：语义被架空（删会话 vs 真压缩）
6. /model：全局写 settings.yaml 无确认，过度权力
7. scope-manager.applyScopes 未实现
8. 三套并行"功能清单"实现（features/doctor/status 页）易漂移

## 5. 安全专项

- ✅ 默认策略 closed 代码层真生效（有测试锁定），但当前部署被运营覆盖为 open
- ✅ 密钥处理正确（plist 占位 + 0600）
- ✅ 写操作身份门禁正确（仅发消息/邮件强制 bot）
- ⚠️ checkToolScopes fail-open
- ❌ /api/remove 零鉴权 + CORS *
- ✅ 无路径遍历（sessionId/media 消毒）

## 6. 测试缺口

85 测试全绿但全是纯函数/单元级，以下**零覆盖**：
1. HTTP 状态服务（/api/remove 鉴权、CORS）——S2 漏网根源
2. 生产-消费真流式闭环
3. run() 子进程 detached/超时/输出上限
4. runSession NDJSON 解析
5. MCP 工具实际执行（scope 门禁、身份降级）
6. 适配器收流回流（slack mention/dingtalk/媒体降级）
7. plugin.js bridge 拉起
8. web-plugin 宿主 ESM/CJS
9. slash 真实分支（/model 写 /doctor spawnSync）

## 7. 优先修复清单

1. 🔴 S1 宿主半 ESM/CJS
2. 🔴 S2 /api/remove 鉴权
3. 🔴 S3 MCP 路径可配置
4. 🔴 S4 plist getcwd
5. 🟠 M1 钉钉配置键 + 诚实标注
6. 🟠 M2 Slack/Discord 依赖 + mention 修复
7. 🟠 M4 cardAction thread
8. 🟠 M5/M6 Telegram 竞态 + parse_mode
9. 🟠 补关键测试（http-status/流式/MCP/channel）
10. 🟡 清死代码 + zod + gitignore
