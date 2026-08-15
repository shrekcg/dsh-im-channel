# Changelog

本项目所有重要变更均记录在此文件，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 首个开源版本：DSH ↔ Feishu/Lark 完整双向桥

## [0.2.0] - 2026-08-15

### Added
- **对话层**: 持久会话 (agents.resume)、话题独立上下文、群聊策略 (4 种模式 + 按群细粒度)、THINKING 表情生命周期、卡片流式打字机 (无「已编辑」)、@用户渲染、bot 互 @ (allowBots)
- **消息层**: 多媒体收发 (图片/文件/音频/视频)、合并转发识别、表情反馈感知 (off/own/all)、文档评论 @ 机器人
- **工具层**: 36 个飞书 MCP 对象工具 (消息/文档/日历/任务/Base/表格/Wiki/邮件/云盘/妙记/审批/搜索/交互提问 ask_user_question)
- **平台层**: 多账号多机器人 (accounts)、doctor 诊断自修复 (19 项检查)、scope-manager 权限自动申请、工具追踪、流式思考显示
- **工程层**: 模块化架构 (src/)、35 单元测试、双语文档、MIT License、launchd 常驻

### Fixed
- 36 个 MCP 工具命令系统性验证，修复 8 处 lark-cli 命令错误
- doctor 权限查询 env 传递问题

## [0.1.0] - 2026-08-14

### Added
- 初始版本：SDK WSClient 收发、持久会话、话题隔离、群聊、卡片流式
