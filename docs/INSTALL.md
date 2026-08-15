# 插件化安装指南

DSH ↔ Feishu Bridge 以 **DSH 插件形态**存在，可插拔、不侵入 DSH 核心。

## 插件架构

```
DSH (DeepSeek Harness)
├── headless profile (插件组合)
│   ├── @deepseek-ai/dsh-base          (核心, 官方)
│   ├── dsh-lark-session               (本插件: 持久会话 runner)
│   │   └── cordis.patch.yml           (插件注入配置)
│   │       ├── lark-session-runner    (agents.resume 持久会话)
│   │       └── mcp-feishu             (飞书 MCP client → 40 工具)
│   └── ...                            (其他官方插件, 不受影响)
│
└── launchd 服务: com.dsh.lark-bridge  (bridge 常驻进程)
```

- **DSH 核心零修改**: 所有功能通过 cordis 插件注入 (`--patch`) 实现
- **可插拔**: 卸载 = 移除插件注入 + 停服务, DSH 恢复正常

## 安装

```bash
npm install                    # 安装依赖
npm run install-bridge         # 安装插件 + 注册 launchd
npm run setup                  # 初始化向导 (应用/权限/授权/事件订阅)
```

## 卸载

```bash
npm run uninstall-bridge       # 停止服务 + 移除插件
```

## 状态检查

```bash
npm run status                 # 查看安装状态
npm run doctor                 # 全面诊断
```

## 插件包内容

| 路径 | 说明 |
|---|---|
| `src/index.js` | bridge 主进程 (常驻) |
| `dsh-lark-session/` | DSH cordis 插件 (持久会话 runner + MCP client) |
| `src/tools/mcp-server.js` | 飞书 MCP server (40 工具) |
| `scripts/install.js` | 安装/卸载/状态管理 |
| `scripts/setup.js` | 初始化向导 |
| `com.dsh.lark-bridge.plist` | launchd 服务模板 |
