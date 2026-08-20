/**
 * dsh-lark-bridge-web host half (node side).
 * The client half (lib/client.js) registers the "IM 机器人" tab in the
 * DSH plugin settings page; this host half is a lightweight placeholder
 * that keeps the plugin row alive in the web profile.
 *
 * NOTE: package.json declares "type": "module", so this host half must be
 * ESM (export const/function), matching the DSH ecosystem convention.
 * (CJS module.exports here crashes under ESM loading — see audit S1.)
 */
export const name = 'dsh-lark-bridge-web';

export function apply(ctx) {
  ctx.on('ready', () => {
    ctx.logger?.info?.('[dsh-lark-bridge-web] IM 机器人 tab ready (client half)');
  });
}
