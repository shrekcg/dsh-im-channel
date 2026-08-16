'use strict';

/**
 * dsh-lark-bridge-web host half (node side).
 * The client half (lib/client.js) registers the "IM 机器人" tab in the
 * DSH plugin settings page; this host half is a lightweight placeholder
 * that keeps the plugin row alive in the web profile.
 */
module.exports.name = 'dsh-lark-bridge-web';
module.exports.apply = function (ctx) {
  ctx.on('ready', () => {
    ctx.logger?.info?.('[dsh-lark-bridge-web] IM 机器人 tab ready (client half)');
  });
};
