import { createMessage, MODEL } from "./lib/client.js";
import { runBash } from "./lib/tools.js";
import type { MessageParam, Tool } from "./types/anthropic.js";

const SYSTEM = `You are a coding agent at ${process.cwd()}. Use bash to solve tasks. Act, don't explain.`;

const TOOLS: Tool[] = [
  {
    name: "bash",
    description: "Run a shell command.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
];

async function test() {
  const messages: MessageParam[] = [
    { role: "user", content: "List the files in the current directory using bash" },
  ];

  const response = await createMessage({
    model: MODEL,
    system: SYSTEM,
    messages,
    tools: TOOLS,
    max_tokens: 8000,
  });

  console.log("Model:", MODEL);
  console.log("Stop reason:", response.stop_reason);
  console.log("Content blocks:", response.content.length);

  for (const block of response.content) {
    if (block.type === "text") {
      console.log("Text:", block.text);
    } else if (block.type === "tool_use") {
      console.log("Tool use:", block.name, block.input);
      if (block.name === "bash") {
        const input = block.input as { command: string };
        const output = await runBash(input.command);
        console.log("Bash output:", output.slice(0, 200));
      }
    }
  }
}

test().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
