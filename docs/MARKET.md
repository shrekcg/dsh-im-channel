# 插件市场上架指南

dsh-lark-bridge 已提交到 **awesome-dsh-plugin**（DSH 官方社区插件市场）。

## 市场信息

| 项 | 值 |
|---|---|
| 市场 | [awesome-dsh-plugin](https://awesome-dsh-plugin.com) |
| 收录仓库 | [github.com/awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) |
| 线上 registry | `https://awesome-dsh-plugin.com/plugins.json` (839+ 插件) |
| 我们的 PR | [#1114](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1114) |
| 收录条目 | `shrekcg__dsh-lark-bridge.yml` (category: notify) |

## 提交要求（已全部满足）

- ✅ `package.json` 声明 `dsh.bundle` manifest（`cordis.patch.yml`，可 `dsh plugin add` 安装）
- ✅ 根 `cordis.patch.yml` + `src/plugin.js`（cordis 插件包装，幂等拉起 bridge 进程）
- ✅ 真实代码 + 73 个测试
- ✅ 仓库 ≥1 天、≥10 commits（当前 49）
- ✅ `dsh-plugin` topic
- ✅ READMEs 用 `node scripts/generate-readme.mjs` 重新生成

## 收录条目格式

```yaml
# data/plugins/shrekcg__dsh-lark-bridge.yml
url: https://github.com/shrekcg/dsh-lark-bridge
name: shrekcg/dsh-lark-bridge
category: notify
description:
  en: '...'
  zh: '...'
```

## 提交流程（重新提交时用）

```bash
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false
git clone <your-fork> && cd awesome-dsh-plugin
cp shrekcg__dsh-lark-bridge.yml data/plugins/
npm ci && node scripts/generate-readme.mjs
git add -A && git commit -m "Add dsh-lark-bridge"
git push && gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin
```

## 推广建议

1. **等待合并**后，插件出现在 market（`https://awesome-dsh-plugin.com/p/shrekcg/dsh-lark-bridge/`）
2. **发布 npm**（`npm publish`）——预构建安装免 `allowBuilds` 授权，体验更好（推荐）
3. **README 加 market 徽章**（合并后生成 badge URL）
4. **活跃维护**：市场定期扫描停更仓库，保持更新
5. **社区分享**：在 DSH 社区/讨论区介绍
