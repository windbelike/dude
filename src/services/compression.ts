import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createMessage, MODEL } from "../lib/client.js";
import { COMPACT_SUMMARY_MAX_TOKENS, TRANSCRIPT_DIR } from "../lib/config.js";
import type { MessageParam } from "../types/anthropic.js";

export function estimateTokens(messages: MessageParam[]): number {
  return JSON.stringify(messages).length / 4;
}

export function microcompact(messages: MessageParam[]): void {
  const indices: Array<{ msgIdx: number; partIdx: number }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (let j = 0; j < msg.content.length; j++) {
        const part = msg.content[j];
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "tool_result"
        ) {
          indices.push({ msgIdx: i, partIdx: j });
        }
      }
    }
  }
  if (indices.length <= 3) return;
  for (let k = 0; k < indices.length - 3; k++) {
    const { msgIdx, partIdx } = indices[k];
    const arr = messages[msgIdx].content as Array<{ content?: unknown }>;
    const part = arr[partIdx];
    if (part && typeof part.content === "string" && part.content.length > 100) {
      part.content = "[cleared]";
    }
  }
}

export async function autoCompact(messages: MessageParam[]): Promise<MessageParam[]> {
  await fs.mkdir(TRANSCRIPT_DIR, { recursive: true });
  const transcriptPath = path.join(TRANSCRIPT_DIR, `transcript_${Date.now()}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join("\n");
  await fs.writeFile(transcriptPath, lines, "utf-8");
  const convText = lines.slice(-80_000);
  const resp = await createMessage({
    model: MODEL,
    messages: [{ role: "user", content: `Summarize for continuity:\n${convText}` }],
    max_tokens: COMPACT_SUMMARY_MAX_TOKENS,
  });
  const summary = resp.content[0]?.type === "text" ? resp.content[0].text : "";
  return [{ role: "user", content: `[Compressed. Transcript: ${transcriptPath}]\n${summary}` }];
}
