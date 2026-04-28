import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { INBOX_DIR } from "../lib/config.js";
import type { Message } from "../types/index.js";

export class MessageBus {
  async send(
    sender: string,
    to: string,
    content: string,
    msgType = "message",
    extra?: Record<string, unknown>,
  ): Promise<string> {
    const msg: Message = {
      type: msgType,
      from: sender,
      content,
      timestamp: Date.now() / 1000,
      ...extra,
    };
    const inboxPath = path.join(INBOX_DIR, `${to}.jsonl`);
    await fs.mkdir(INBOX_DIR, { recursive: true });
    await fs.appendFile(inboxPath, `${JSON.stringify(msg)}\n`, "utf-8");
    return `Sent ${msgType} to ${to}`;
  }

  async readInbox(name: string): Promise<Message[]> {
    const inboxPath = path.join(INBOX_DIR, `${name}.jsonl`);
    if (!existsSync(inboxPath)) return [];
    const text = await fs.readFile(inboxPath, "utf-8");
    await fs.writeFile(inboxPath, "", "utf-8");
    return text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Message);
  }

  async broadcast(sender: string, content: string, names: string[]): Promise<string> {
    let count = 0;
    for (const n of names) {
      if (n !== sender) {
        await this.send(sender, n, content, "broadcast");
        count++;
      }
    }
    return `Broadcast to ${count} teammates`;
  }
}
