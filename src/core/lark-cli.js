'use strict';

/**
 * lark-cli 路径统一解析
 *
 * 消除全项目对 /opt/homebrew/bin/lark-cli 的硬编码 (可移植性: Linux/非 Homebrew 也能用)。
 * 解析优先级: env LARK_CLI → PATH 中的 lark-cli → 常见安装位置。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let cached = null;

function findLarkCli() {
  if (cached) return cached;
  // 1. 环境变量 (最高优先)
  if (process.env.LARK_CLI && fs.existsSync(process.env.LARK_CLI)) {
    cached = process.env.LARK_CLI;
    return cached;
  }
  // 2. 从 PATH 查找
  try {
    const r = spawnSync('which', ['lark-cli'], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout.trim()) {
      cached = r.stdout.trim();
      return cached;
    }
  } catch (e) {}
  // 3. 常见安装位置 (macOS Homebrew / Linux / user local)
  const candidates = [
    '/opt/homebrew/bin/lark-cli',
    '/usr/local/bin/lark-cli',
    path.join(os.homedir(), '.local', 'bin', 'lark-cli'),
  ];
  cached = candidates.find((p) => fs.existsSync(p)) || '/opt/homebrew/bin/lark-cli';
  return cached;
}

module.exports = { findLarkCli };
