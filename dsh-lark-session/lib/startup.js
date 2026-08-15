import { Command } from "commander";
import { parseCmdline } from "@deepseek-ai/dsh-cmdline";

/**
 * Persistent-session startup provider: parses `--session <id>` (optional) and the
 * task positional, then publishes LARK_SESSION_STARTUP_SERVICE. The runner uses
 * `agents.resume` when a session id is given, else `agents.create` (first turn).
 */
export const name = "lark-session-startup";
export const inject = ["cmdlineArgs"];
export const LARK_SESSION_STARTUP_SERVICE = "larkSessionStartup";

function larkSessionCommand() {
  return new Command()
    .name("dsh --profile headless --patch dsh-lark-session")
    .description("Run one turn on a persistent DSH session (Feishu bridge).")
    .helpOption("-h, --help", "show this help")
    .option("--session <id>", "persistent session id to resume (default: create new)")
    .argument("[task...]", "the task text; multiple words are joined by spaces")
    .addHelpText("after", `
Examples:
  dsh --profile headless --patch dsh-lark-session --session feishu-main "你好"
  dsh --profile headless --patch dsh-lark-session "第一句话"
`);
}

export function apply(ctx) {
  const program = larkSessionCommand();
  program.action(() => {
    const task = program.args.join(" ");
    if (task.trim() === "") {
      program.error("error: a task is required");
    }
    ctx.provide(LARK_SESSION_STARTUP_SERVICE, {
      task,
      sessionId: program.opts().session || "",
    });
  });
  parseCmdline(ctx, program);
}
