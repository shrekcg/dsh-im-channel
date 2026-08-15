#!/usr/bin/env bash
# 模拟 CI 环境验证 MCP server (修正: 保持 stdin 打开 + 验证 ready 标记)
set -e
# 保持 stdin 打开 (tail -f /dev/null 提供持续输入, 防止 stdio server 因 EOF 退出)
tail -f /dev/null | node src/tools/mcp-server.js > /tmp/mcp-ci.out 2>&1 &
MCP_PID=$!
sleep 3
if grep -q "server ready" /tmp/mcp-ci.out; then
  echo "✅ MCP server ready 标记出现"
else
  echo "❌ MCP server 未输出 ready"; kill $MCP_PID 2>/dev/null; exit 1
fi
kill $MCP_PID 2>/dev/null || true
echo "✅ MCP server 启动验证通过"
