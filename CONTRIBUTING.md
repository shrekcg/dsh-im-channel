# 贡献指南

感谢你考虑为 DSH ↔ Feishu/Lark Bridge 贡献代码！以下是参与方式。

## 开发环境

```bash
# 克隆仓库
git clone <repo-url> dsh-lark-bridge
cd dsh-lark-bridge

# 安装依赖
npm install

# 运行测试
npm test

# 运行诊断
npm run doctor
```

## 代码结构

```
src/
├── index.js              # 入口 (多账号)
├── config.js             # 配置管理
├── channel.js            # 飞书通道 (SDK)
├── session.js            # 持久会话
├── core/                 # 核心服务 (scope-manager)
├── inbound/              # 入站处理 (policy/media/reaction/merge-forward/comment)
├── outbound/             # 出站处理 (mention)
├── tools/                # MCP server (36 工具)
└── commands/             # doctor
```

## 添加新功能

1. **新增 MCP 工具**: 在 `src/tools/mcp-server.js` 添加 `server.tool(...)`，注意使用正确的 lark-cli 命令（可用 `lark-cli schema` 验证）
2. **新增消息类型**: 在 `src/inbound/` 添加处理器
3. **新增配置项**: 在 `src/config.js` 添加默认值 + 环境变量解析

## 测试

- 使用 Node.js 内置 `node:test` 框架
- 测试文件位于 `tests/*.test.js`
- 运行: `npm test`

## 提交规范

- 遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)
- 示例: `feat: add new tool`, `fix: correct command`, `docs: update README`

## 发布检查清单

提交 PR 前请确认:
- [ ] `npm test` 全部通过
- [ ] `npm run doctor` 无失败项
- [ ] 新增工具的命令经过实际调用验证
- [ ] 文档已更新 (README/CHANGELOG)
