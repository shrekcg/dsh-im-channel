'use strict';

/**
 * dsh-lark-bridge — cordis plugin wrapper
 *
 * Makes the package installable via `dsh plugin add` (required by the
 * awesome-dsh-plugin market). The heavy lifting stays in the standalone
 * bridge process (src/index.js, managed by launchd); this wrapper just
 * ensures the plugin row exists in the profile and can spawn the bridge.
 *
 * Usage in a profile bundle patch:
 *   - insert:
 *       - id: lark-bridge
 *         name: 'dsh-lark-bridge'
 */
module.exports.name = 'dsh-lark-bridge';

module.exports.apply = function (ctx, config) {
  const { spawn } = require('child_process');
  const path = require('path');
  const bridgeEntry = path.join(__dirname, 'index.js');

  // 若 bridge 未由 launchd 托管, 由插件拉起 (幂等: 检查端口/进程)
  const spawnBridge = () => {
    const child = spawn(process.execPath, [bridgeEntry], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env },
    });
    child.unref();
    ctx.logger?.info?.('[dsh-lark-bridge] bridge 子进程已启动 pid=' + child.pid);
    return child;
  };

  ctx.on('ready', () => {
    // 简单幂等: 若 8899 状态端口未监听则启动 bridge
    const http = require('http');
    const probe = http.get({ host: '127.0.0.1', port: config?.statusPort || 8899, timeout: 800 }, (res) => {
      res.resume();
      ctx.logger?.info?.('[dsh-lark-bridge] bridge 已在运行 (状态端口可达)');
    });
    probe.on('timeout', () => { probe.destroy(); spawnBridge(); });
    probe.on('error', () => spawnBridge());
  });
};
