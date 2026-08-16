# dsh-lark-bridge-web — DSH web GUI 插件

在 DSH Web 的「设置 → 插件」页注册一个 **「IM 机器人」** tab，展示飞书渠道状态。

## 结构

```
web-plugin/
├── package.json       # dsh.client 声明 (platform: web, inject: slots/locale)
├── cordis.patch.yml   # web profile 插件注入
├── lib/
│   ├── index.js       # host 半 (node 端占位)
│   └── client.js      # client 半 (ModuleLoader 格式, 注册 settings.plugins.tab)
└── src/               # (预留) TypeScript 源码 + tsdown 构建
```

## 原理

- `client.js` 用 `window.__ModuleLoader__.load()` 包装（DSH 浏览器端加载格式）
- `apply(ctx)` 里 `ctx.slots.inject("settings.plugins.tab", ...)` 注册 tab
- tab 组件 `LarkStatusTab` fetch `http://127.0.0.1:8899/api/status`（bridge 状态服务），渲染渠道列表 + 飞书详情
- bridge 的 8899 端口已加 CORS（允许 DSH web 跨端口读取）

## 安装

```bash
# 复制到 web profile
cp -r web-plugin ~/.dsh/profiles/web/node_modules/dsh-lark-bridge-web
# 在 ~/.dsh/profiles/web/cordis.patch.yml 添加:
#   - insert:
#       - id: lark-bridge-web
#         name: 'dsh-lark-bridge-web'
# 重启 web 应用
```

## 开发

client.js 当前为手写 ModuleLoader 格式（无需构建）。若需 TypeScript 源码 + tsdown 构建（对齐 DSH 官方 client 插件），在 src/ 下开发后用 `npm run build` 生成 lib/client.js。
