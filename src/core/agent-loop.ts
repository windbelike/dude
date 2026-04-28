import { createMessage, MODEL } from "../lib/client.js";
import { MAX_TOKENS, TOKEN_THRESHOLD } from "../lib/config.js";
import { autoCompact, estimateTokens, microcompact } from "../services/compression.js";
import type { AgentContext } from "../services/tool-registry.js";
import { dispatchTool, getToolList } from "../services/tool-registry.js";
import type { MessageParam, ToolUseBlock } from "../types/anthropic.js";

export async function agentLoop(
  messages: MessageParam[],
  ctx: AgentContext,
  systemPrompt: string,
): Promise<void> {
  let roundsWithoutTodo = 0;

  while (true) {
    microcompact(messages);
    if (estimateTokens(messages) > TOKEN_THRESHOLD) {
      console.log("[auto-compact triggered]");
      messages.splice(0, messages.length, ...(await autoCompact(messages)));
    }

    const notifs = ctx.bg.drain();
    if (notifs.length) {
      const txt = notifs.map((n) => `[bg:${n.task_id}] ${n.status}: ${n.result}`).join("\n");
      messages.push({
        role: "user",
        content: `<background-results>\n${txt}\n</background-results>`,
      });
    }

    const inbox = await ctx.bus.readInbox("lead");
    if (inbox.length) {
      messages.push({
        role: "user",
        content: `<inbox>${JSON.stringify(inbox, null, 2)}</inbox>`,
      });
    }

    const response = await createMessage({
      model: MODEL,
      system: systemPrompt,
      messages,
      tools: getToolList(),
      max_tokens: MAX_TOKENS,
    });

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") {
      return;
    }

    const results: MessageParam["content"] = [];
    let usedTodo = false;
    let manualCompress = false;

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const toolBlock = block as ToolUseBlock;
        if (toolBlock.name === "compress") {
          manualCompress = true;
        }

        let output: string;
        try {
          output = await dispatchTool(toolBlock, ctx);
        } catch (e: unknown) {
          const err = e as { message: string };
          output = `Error: ${err.message}`;
        }

        console.log(`> ${toolBlock.name}:`);
        console.log(output.slice(0, 200));
        results.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: output,
        });
        if (toolBlock.name === "TodoWrite") usedTodo = true;
      }
    }

    roundsWithoutTodo = usedTodo ? 0 : roundsWithoutTodo + 1;
    if (ctx.todo.hasOpenItems() && roundsWithoutTodo >= 3) {
      results.push({ type: "text", text: "<reminder>Update your todos.</reminder>" });
    }

    messages.push({ role: "user", content: results });
    if (manualCompress) {
      console.log("[manual compact]");
      messages.splice(0, messages.length, ...(await autoCompact(messages)));
      return;
    }
  }
}
