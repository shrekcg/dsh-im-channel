import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

/**
 * Persistent-session runner for the Feishu bridge.
 *
 * Unlike the one-shot headless runner (which always creates a fresh
 * session-<uuid>), this runner resumes a FIXED session id across turns via
 * `agents.resume`. First turn creates the session (persisted by
 * dsh-session-persistence-jsonl), later turns load the stored history so the
 * agent keeps context/memory — the same experience as the DSH web/TUI UI.
 */
export const name = "lark-session-runner";
export const inject = ["agentDefaultModel", "agents", "sessions", "sessionPersistence"];

const Config = z.object({
  task: z.string().required(),
  sessionId: z.string().required(),
});

const internals = { stdout: process.stdout, stderr: process.stderr };

/** Aggregate the last assistant text and turn outcome in one owned interval. */
function summarize(events, firstSeq) {
  let started = false;
  let text = "";
  let reason;
  let thinking = "";
  const tools = [];
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "turn/start") {
      started = true;
      continue;
    }
    if (!started) continue;
    if (event.type === "assistant/message") {
      const blocks = event.data.message.content || [];
      const joined = blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (joined !== "") text = joined;
      // 收集思考过程 (reasoning block)
      const reasoning = blocks
        .filter((block) => block.type === "reasoning")
        .map((block) => block.text || block.content || "")
        .join("");
      if (reasoning && reasoning.trim() !== "") thinking = reasoning;
      // 收集工具调用 (用于飞书工具追踪卡片)
      for (const block of blocks) {
        if (block.type === "tool-call") {
          const name = block.name || block.toolName || "tool";
          const args = block.arguments || block.input || {};
          tools.push({ name, summary: String(args && typeof args === "object" ? (args.description || args.prompt || args.query || "") : args).slice(0, 80) });
        }
      }
    }
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, reason, tools, thinking };
}

async function run(ctx, task, sessionId, io) {
  await ctx.get("loader")?.await();
  const agents = ctx.get("agents");
  const defaultModel = ctx.get("agentDefaultModel");
  const sessions = ctx.get("sessions");
  const sessionPersistence = ctx.get("sessionPersistence");
  if (agents === void 0 || defaultModel === void 0 || sessions === void 0) return;

  const selection = defaultModel.currentSelection();
  const agentOptions = {
    provider: selection.provider,
    model: selection.model,
  };
  const setup = (agentCtx) => {
    installModelSelection(agentCtx, {
      current: selection,
      assembled: void 0,
    });
  };

  const hasSessionArg = sessionId && sessionId !== "" && sessionId !== "new";
  const sid = hasSessionArg ? SessionId(sessionId) : SessionId(`feishu-${Date.now()}`);
  let handle;

  if (hasSessionArg && sessionPersistence) {
    // 尝试恢复持久会话
    const hasStored = await sessionPersistence.inspect(sid).catch(() => void 0);
    if (hasStored) {
      handle = await agents.resume({
        resumeSessionId: sid,
        agentOptions,
        setup,
      });
    } else {
      handle = await agents.create({
        sessionId: sid,
        meta: { cwd: process.cwd() },
        agentOptions,
        setup,
      });
    }
  } else {
    handle = await agents.create({
      sessionId: sid,
      meta: { cwd: process.cwd() },
      agentOptions,
      setup,
    });
  }

  const agent = handle ? handle.agent : agents.get(sid);
  await agent.whenIdle();
  const firstSeq = agent.session.seq;

  agent.followup(
    createUserMessage({
      content: [{ type: "text", text: task }],
      source: { kind: "user" },
    })
  );
  await agent.whenIdle();
  await sessions.flush(agent.session);

  const outcome = summarize(agent.session.events, firstSeq);
  io.stdout.write(
    JSON.stringify({
      sessionId: String(sid),
      text: outcome.text,
      reason: outcome.reason?.kind || "completed",
      seq: agent.session.seq,
      tools: outcome.tools,
      thinking: outcome.thinking ? outcome.thinking.slice(0, 2000) : "",
    }) + "\n"
  );
  if (outcome.reason?.kind === "error") {
    io.stderr.write(
      `dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`
    );
  }
  io.exit(outcome.reason?.kind === "completed" ? 0 : 1);
}

export function apply(ctx, config) {
  const exit = ctx.get("appExit");
  if (exit === void 0) {
    throw new Error("lark-session-runner: the launcher must provide ctx.appExit");
  }
  const io = { stdout: internals.stdout, stderr: internals.stderr, exit };
  run(ctx, config.task, config.sessionId, io).catch((error) => {
    io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
    io.exit(1);
  });
}
