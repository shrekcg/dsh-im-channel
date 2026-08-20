/* dsh-lark-bridge-web client plugin (hand-written ModuleLoader format)
 *
 * Registers an "IM 机器人" tab inside the DSH plugin settings page.
 * The tab fetches Feishu channel status from the bridge HTTP server
 * (default http://127.0.0.1:8899/api/status) and renders:
 *   - channel list (Feishu + reserved dingtalk/qq/wechat)
 *   - Feishu detail (online / account / channel / last check / health)
 *
 * Build-free: written directly in the ModuleLoader UMD format DSH expects.
 */
window.__ModuleLoader__.load({
	id: "dsh-lark-bridge-web",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		const STATUS_URL = "http://127.0.0.1:8899/api/status";

		// Inline styles (kept simple; DSH css-module pipeline optional)
		const css = `
			.lb-section{width:100%;max-width:860px;color:var(--dsw-alias-label-primary)}.lb-layout{display:flex;gap:16px;align-items:flex-start}.lb-sidebar{flex:0 0 200px;position:sticky;top:0}.lb-main{flex:1;min-width:0}
			.lb-head{font-size:14px;font-weight:600;margin:0}
			.lb-sub{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0}
			.lb-channels{display:flex;flex-direction:column;gap:6px}
			.lb-channel{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
			.lb-channel.current{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent)}
			.lb-channel.offline{opacity:.55}
			.lb-ic{font-size:20px}
			.lb-cname{font-size:14px;font-weight:500}
			.lb-cstate{font-size:12px;color:var(--dsw-alias-label-tertiary)}
			.lb-badge{display:inline-block;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary);font-size:12px;padding:2px 8px;border-radius:10px}
			.lb-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:14px 16px}
			.lb-acchead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
			.lb-accname{font-weight:600;font-size:14px}
			.lb-accstatus{color:var(--dsw-alias-state-success-primary);font-size:13px}
			.lb-accid{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-bottom:10px}
			.lb-detail{display:grid;grid-template-columns:90px 1fr;gap:4px 10px;font-size:13px;margin-top:8px}
			.lb-detail dt{color:var(--dsw-alias-label-tertiary)}
			.lb-detail dd{margin:0;color:var(--dsw-alias-label-secondary)}
			.lb-health{margin-top:10px;padding:8px 12px;background:var(--dsw-alias-bg-layer-1);border-radius:6px;font-size:13px;color:var(--dsw-alias-label-secondary)}
			.lb-actions{margin-top:12px;display:flex;gap:8px}
			.lb-btn{padding:5px 12px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit}
			.lb-btn:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
			.lb-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
			.lb-fail{color:var(--dsw-alias-state-error-primary);font-size:13px;padding:12px 0}
			.lb-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;padding:12px 0}
		`;
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin=dsh-lark-bridge-web]")) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-lark-bridge-web";
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		function ChannelRow({ c }) {
			return react_jsx_runtime.jsx("div", {
				className: "lb-channel" + (c.current ? " current" : "") + (c.connected ? "" : " offline"),
				children: [
					react_jsx_runtime.jsx("span", { className: "lb-ic", children: c.icon }),
					react_jsx_runtime.jsx("div", { children: [
						react_jsx_runtime.jsx("div", { className: "lb-cname", children: c.name }),
						react_jsx_runtime.jsx("div", { className: "lb-cstate", children: c.connected ? "🟢 在线" : "⚪ 未配置" })
					] })
				]
			});
		}

		function LarkStatusTab() {
			const [status, setStatus] = react.useState(null);
			const [error, setError] = react.useState("");
			const [loading, setLoading] = react.useState(true);
			const [selected, setSelected] = react.useState("feishu");

			const load = react.useCallback(async () => {
				try {
					const r = await fetch(STATUS_URL, { cache: "no-store" });
					if (!r.ok) throw new Error("HTTP " + r.status);
					setStatus(await r.json());
					setError("");
				} catch (e) {
					setError("无法连接 bridge 状态服务: " + e.message + " (请确认 bridge 已启动, 端口 8899)");
				} finally {
					setLoading(false);
				}
			}, []);

			react.useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

			if (loading) return react_jsx_runtime.jsx("div", { className: "lb-sub", children: "加载中..." });
			if (error) {
				return react_jsx_runtime.jsx("div", { className: "lb-section", children: [
					react_jsx_runtime.jsx("h2", { className: "lb-head", children: "IM 机器人" }),
					react_jsx_runtime.jsx("div", { className: "lb-fail", children: "⚠️ " + error }),
					react_jsx_runtime.jsx("button", { className: "lb-btn", onClick: load, children: "重试" })
				] });
			}
			const f = status.feishu;
			const sel = status.channels.find((c) => c.id === selected) || status.channels[0];
			const selDetail = status.all ? (status.all.find((a) => a.channel === sel.id) || {}) : {};
			return react_jsx_runtime.jsx("div", { className: "lb-section", children: [
				react_jsx_runtime.jsx("h2", { className: "lb-head", children: "IM 机器人" }),
				react_jsx_runtime.jsx("p", { className: "lb-sub", children: "选择左侧渠道查看状态或开始接入" }),
				react_jsx_runtime.jsx("div", { className: "lb-layout", children: [
					react_jsx_runtime.jsx("div", { className: "lb-sidebar", children: [
						react_jsx_runtime.jsx("div", { className: "lb-channels", children: status.channels.map((c) => react_jsx_runtime.jsx("div", {
							className: "lb-channel" + (c.id === selected ? " current" : "") + (c.connected ? "" : " offline"),
							onClick: () => setSelected(c.id),
							style: { cursor: "pointer" },
							children: [
								react_jsx_runtime.jsx("span", { className: "lb-ic", children: c.icon }),
								react_jsx_runtime.jsx("div", { children: [
									react_jsx_runtime.jsx("div", { className: "lb-cname", children: c.name }),
									react_jsx_runtime.jsx("div", { className: "lb-cstate", children: c.connected ? "🟢 在线" : "⚪ 未配置" })
								] })
							]
						}, c.id)) })
					] }),
					react_jsx_runtime.jsx("div", { className: "lb-main", children: [
						react_jsx_runtime.jsx("div", { style: { marginTop: 0 }, children: [
					react_jsx_runtime.jsx("h3", { className: "lb-head", children: sel.icon + " " + sel.name }),
					(sel.id === "feishu")
						? react_jsx_runtime.jsx("div", { children: [
							react_jsx_runtime.jsx("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }, children: [
								react_jsx_runtime.jsx("span", { className: "lb-badge", children: f.online + " / 1 在线" }),
								react_jsx_runtime.jsx("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" }, children: "App ID: " + f.appId })
							] }),
							react_jsx_runtime.jsx("p", { className: "lb-sub", children: (f.accounts || []).length + " 个已接入账号" }),
							(f.accounts || []).length === 0
								? react_jsx_runtime.jsx("div", { className: "lb-empty", children: "暂无已接入账号" })
								: f.accounts.map((a) => react_jsx_runtime.jsx("div", { className: "lb-card", children: [
									react_jsx_runtime.jsx("div", { className: "lb-acchead", children: [
										react_jsx_runtime.jsx("span", { className: "lb-accname", children: a.name }),
										react_jsx_runtime.jsx("span", { className: "lb-accstatus", children: "🟢 " + a.status })
									] }),
									react_jsx_runtime.jsx("div", { className: "lb-accid", children: "账号 ID: " + a.id }),
									react_jsx_runtime.jsx("dl", { className: "lb-detail", children: [
										react_jsx_runtime.jsx("dt", { children: "消息通道" }), react_jsx_runtime.jsx("dd", { children: a.messageChannel }),
										react_jsx_runtime.jsx("dt", { children: "最近检查" }), react_jsx_runtime.jsx("dd", { children: a.lastChecked || "—" }),
										react_jsx_runtime.jsx("dt", { children: "最近消息" }), react_jsx_runtime.jsx("dd", { children: f.lastMessageAt || "—" }),
										react_jsx_runtime.jsx("dt", { children: "运行时长" }), react_jsx_runtime.jsx("dd", { children: f.uptimeText || "—" }),
										react_jsx_runtime.jsx("dt", { children: "进程 PID" }), react_jsx_runtime.jsx("dd", { children: String(f.pid) })
									] }),
									react_jsx_runtime.jsx("div", { className: "lb-health", children: a.health }),
									react_jsx_runtime.jsx("div", { className: "lb-actions", children: [
										react_jsx_runtime.jsx("button", { className: "lb-btn", onClick: () => { fetch("http://127.0.0.1:8899/api/check", { method: "POST" }).then(() => load()); }, children: "检查连接" }),
										react_jsx_runtime.jsx("button", { className: "lb-btn danger", onClick: () => { if (confirm("确定移除飞书接入? bridge 将停止。")) fetch("http://127.0.0.1:8899/api/remove", { method: "POST", headers: { "X-Remove-Token": status.statusToken || "" } }); }, children: "移除接入" })
									] })
								] }, a.id))
						] })
						: react_jsx_runtime.jsx("div", { className: "lb-empty", children: sel.connected
							? "已连接 ✅ (详细状态见 /status)"
							: react_jsx_runtime.jsx("div", { children: [
								react_jsx_runtime.jsx("p", { className: "lb-sub", children: "未配置。点击下方入口开始接入:" }),
								sel.platform ? react_jsx_runtime.jsx("a", { className: "lb-btn", href: sel.platform, target: "_blank", rel: "noreferrer", style: { display: "inline-block", textDecoration: "none", marginTop: 8 }, children: "🔗 打开 " + sel.name + " 平台" }) : null,
								(sel.steps || []).map((s, i) => react_jsx_runtime.jsx("div", { style: { marginTop: 6, fontSize: 13, color: "var(--dsw-alias-label-secondary)" }, children: (i + 1) + ". " + s }, i)),
								(sel.credential || []).length > 0 ? react_jsx_runtime.jsx("div", { style: { marginTop: 10, fontSize: 12, color: "var(--dsw-alias-label-tertiary)" }, children: "需要配置: " + sel.credential.join("、") + " → 填入环境变量 " + (sel.env || []).join(", ") }) : null,
								sel.note ? react_jsx_runtime.jsx("div", { className: "lb-health", style: { marginTop: 10 }, children: "💡 " + sel.note }) : null,
								react_jsx_runtime.jsx("div", { style: { marginTop: 10, fontSize: 12, color: "var(--dsw-alias-label-tertiary)" }, children: "配置后重启 bridge 生效: launchctl restart com.dsh.lark-bridge" })
							] }) })
						] })
					] })
				] })
			] });
		}

		function apply(ctx) {
			const NS = "dsh-lark-bridge-web";
			ctx.effect(() => ctx.locale?.register?.(NS, { zh: { tab: "IM 机器人" }, en: { tab: "IM Bots" } }), "dsh-lark-bridge-web: locale");
			// 用 locale.bind 生效 i18n (en 环境显示 "IM Bots")
			const t = ctx.locale?.bind ? ctx.locale.bind(NS) : (NS ? (key) => ({ "tab": "IM 机器人" }[key] || key) : (key) => ({ "tab": "IM 机器人" }[key] || key));
			// 兼容: bind 不存在时回退硬编码
			const tr = typeof t === 'function' ? t : (key) => ({ "tab": "IM 机器人" }[key] || key);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "im-bot",
				order: 30,
				label: () => tr("tab"),
				locale: NS,
				inject: () => ({})
			}, LarkStatusTab));
		}

		const inject = ["slots", "locale"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
