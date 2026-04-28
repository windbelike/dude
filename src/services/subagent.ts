import { createMessage, MODEL } from "../lib/client.js";
import { MAX_OUTPUT_LENGTH, MAX_TOKENS, SUBAGENT_MAX_ROUNDS } from "../lib/config.js";
import { runBash, runEdit, runRead, runWrite } from "../lib/tools.js";
import type { MessageParam, Tool, ToolUseBlock } from "../types/anthropic.js";

export async function runSubagent(prompt: string, agentType = "Explore"): Promise<string> {
  const subTools: Tool[] = [
    {
      name: "bash",
      description: "Run command.",
      input_schema: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    {
      name: "read_file",
      description: "Read file.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  ];

  if (agentType !== "Explore") {
    subTools.push(
      {
        name: "write_file",
        description: "Write file.",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
      {
        name: "edit_file",
        description: "Edit file.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string" },
            old_text: { type: "string" },
            new_text: { type: "string" },
          },
          required: ["path", "old_text", "new_text"],
        },
      },
    );
  }

  const subHandlers: Record<string, (input: Record<string, unknown>) => Promise<string>> = {
    bash: (input) => runBash(String(input.command)),
    read_file: (input) => runRead(String(input.path)),
    write_file: (input) => runWrite(String(input.path), String(input.content)),
    edit_file: (input) =>
      runEdit(String(input.path), String(input.old_text), String(input.new_text)),
  };

  const subMsgs: MessageParam[] = [{ role: "user", content: prompt }];
  let resp: Awaited<ReturnType<typeof createMessage>> | null = null;

  for (let i = 0; i < SUBAGENT_MAX_ROUNDS; i++) {
    resp = await createMessage({
      model: MODEL,
      messages: subMsgs,
      tools: subTools,
      max_tokens: MAX_TOKENS,
    });
    subMsgs.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason !== "tool_use") break;

    const results: MessageParam["content"] = [];
    for (const b of resp.content) {
      if (b.type === "tool_use") {
        const toolBlock = b as ToolUseBlock;
        const h = subHandlers[toolBlock.name] || (() => Promise.resolve("Unknown tool"));
        const out = (await h(toolBlock.input as Record<string, unknown>)).slice(
          0,
          MAX_OUTPUT_LENGTH,
        );
        results.push({ type: "tool_result", tool_use_id: toolBlock.id, content: out });
      }
    }
    subMsgs.push({ role: "user", content: results });
  }

  if (resp) {
    return resp.content.map((b) => (b.type === "text" ? b.text : "")).join("") || "(no summary)";
  }
  return "(subagent failed)";
}
