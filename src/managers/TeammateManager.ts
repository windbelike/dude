import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { createMessage, MODEL } from "../lib/client.js";
import {
  AGENT_LOOP_MAX_ROUNDS,
  IDLE_TIMEOUT_SECONDS,
  MAX_TOKENS,
  POLL_INTERVAL_SECONDS,
  TASKS_DIR,
  TEAM_DIR,
  WORKDIR,
} from "../lib/config.js";
import { runBash, runEdit, runRead, runWrite } from "../lib/tools.js";
import type { MessageParam, Tool, ToolUseBlock } from "../types/anthropic.js";
import type { Task, TeamConfig, Teammate } from "../types/index.js";
import type { MessageBus } from "./MessageBus.js";
import type { TaskManager } from "./TaskManager.js";

export class TeammateManager {
  bus: MessageBus;
  taskMgr: TaskManager;
  configPath: string;
  config: TeamConfig;

  constructor(bus: MessageBus, taskMgr: TaskManager) {
    this.bus = bus;
    this.taskMgr = taskMgr;
    this.configPath = path.join(TEAM_DIR, "config.json");
    this.config = { team_name: "default", members: [] };
  }

  async init(): Promise<void> {
    if (existsSync(this.configPath)) {
      const raw = await fs.readFile(this.configPath, "utf-8");
      this.config = JSON.parse(raw) as TeamConfig;
    }
  }

  private async save(): Promise<void> {
    await fs.mkdir(TEAM_DIR, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
  }

  private find(name: string): Teammate | null {
    return this.config.members.find((m) => m.name === name) || null;
  }

  async spawn(name: string, role: string, prompt: string): Promise<string> {
    const member = this.find(name);
    if (member) {
      if (member.status !== "idle" && member.status !== "shutdown") {
        return `Error: '${name}' is currently ${member.status}`;
      }
      member.status = "working";
      member.role = role;
    } else {
      this.config.members.push({ name, role, status: "working" });
    }
    await this.save();
    this.loop(name, role, prompt).catch((err: unknown) => {
      console.error(`Teammate ${name} loop error:`, err);
    });
    return `Spawned '${name}' (role: ${role})`;
  }

  private async setStatus(name: string, status: string): Promise<void> {
    const member = this.find(name);
    if (member) {
      member.status = status;
      await this.save();
    }
  }

  private async loop(name: string, role: string, prompt: string): Promise<void> {
    const teamName = this.config.team_name;
    const sysPrompt = `You are '${name}', role: ${role}, team: ${teamName}, at ${WORKDIR}. Use idle when done with current work. You may auto-claim tasks.`;
    const messages: MessageParam[] = [{ role: "user", content: prompt }];
    const tools: Tool[] = [
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
      {
        name: "send_message",
        description: "Send message.",
        input_schema: {
          type: "object",
          properties: { to: { type: "string" }, content: { type: "string" } },
          required: ["to", "content"],
        },
      },
      {
        name: "idle",
        description: "Signal no more work.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "claim_task",
        description: "Claim task by ID.",
        input_schema: {
          type: "object",
          properties: { task_id: { type: "integer" } },
          required: ["task_id"],
        },
      },
    ];

    while (true) {
      // WORK PHASE
      for (let round = 0; round < AGENT_LOOP_MAX_ROUNDS; round++) {
        const inbox = await this.bus.readInbox(name);
        for (const msg of inbox) {
          if (msg.type === "shutdown_request") {
            await this.setStatus(name, "shutdown");
            return;
          }
          messages.push({ role: "user", content: JSON.stringify(msg) });
        }

        let response: Awaited<ReturnType<typeof createMessage>>;
        try {
          response = await createMessage({
            model: MODEL,
            system: sysPrompt,
            messages,
            tools,
            max_tokens: MAX_TOKENS,
          });
        } catch (err: unknown) {
          console.error(`API error for ${name}:`, err);
          await this.setStatus(name, "shutdown");
          return;
        }

        messages.push({ role: "assistant", content: response.content });
        if (response.stop_reason !== "tool_use") break;

        const results: MessageParam["content"] = [];
        let idleRequested = false;
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolBlock = block as ToolUseBlock;
            let output: string;
            if (toolBlock.name === "idle") {
              idleRequested = true;
              output = "Entering idle phase.";
            } else if (toolBlock.name === "claim_task") {
              const input = toolBlock.input as { task_id: number };
              output = await this.taskMgr.claim(input.task_id, name);
            } else if (toolBlock.name === "send_message") {
              const input = toolBlock.input as { to: string; content: string };
              output = await this.bus.send(name, input.to, input.content);
            } else {
              const dispatch: Record<string, (input: Record<string, unknown>) => Promise<string>> =
                {
                  bash: (input) => runBash(String(input.command)),
                  read_file: (input) => runRead(String(input.path)),
                  write_file: (input) => runWrite(String(input.path), String(input.content)),
                  edit_file: (input) =>
                    runEdit(String(input.path), String(input.old_text), String(input.new_text)),
                };
              const h = dispatch[toolBlock.name] || (() => Promise.resolve("Unknown"));
              output = await h(toolBlock.input as Record<string, unknown>);
            }
            console.log(`  [${name}] ${toolBlock.name}: ${output.slice(0, 120)}`);
            results.push({ type: "tool_result", tool_use_id: toolBlock.id, content: output });
          }
        }
        messages.push({ role: "user", content: results });
        if (idleRequested) break;
      }

      // IDLE PHASE
      await this.setStatus(name, "idle");
      let resume = false;
      const iterations = Math.max(
        Math.floor(IDLE_TIMEOUT_SECONDS / Math.max(POLL_INTERVAL_SECONDS, 1)),
        1,
      );
      for (let i = 0; i < iterations; i++) {
        await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_SECONDS * 1000));
        const inbox = await this.bus.readInbox(name);
        if (inbox.length) {
          for (const msg of inbox) {
            if (msg.type === "shutdown_request") {
              await this.setStatus(name, "shutdown");
              return;
            }
            messages.push({ role: "user", content: JSON.stringify(msg) });
          }
          resume = true;
          break;
        }
        const unclaimed: Task[] = [];
        const files = await fs.readdir(TASKS_DIR).catch(() => [] as string[]);
        for (const f of files) {
          if (!f.startsWith("task_") || !f.endsWith(".json")) continue;
          const raw = await fs.readFile(path.join(TASKS_DIR, f), "utf-8");
          const t = JSON.parse(raw) as Task;
          if (t.status === "pending" && !t.owner && !t.blockedBy?.length) {
            unclaimed.push(t);
          }
        }
        if (unclaimed.length) {
          const task = unclaimed[0];
          if (task) {
            await this.taskMgr.claim(task.id, name);
            if (messages.length <= 3) {
              messages.unshift({
                role: "user",
                content: `<identity>You are '${name}', role: ${role}, team: ${teamName}.</identity>`,
              });
              messages.splice(1, 0, { role: "assistant", content: `I am ${name}. Continuing.` });
            }
            messages.push({
              role: "user",
              content: `<auto-claimed>Task #${task.id}: ${task.subject}\n${task.description || ""}</auto-claimed>`,
            });
            messages.push({
              role: "assistant",
              content: `Claimed task #${task.id}. Working on it.`,
            });
            resume = true;
            break;
          }
        }
      }
      if (!resume) {
        await this.setStatus(name, "shutdown");
        return;
      }
      await this.setStatus(name, "working");
    }
  }

  listAll(): string {
    if (!this.config.members.length) return "No teammates.";
    const lines = [`Team: ${this.config.team_name}`];
    for (const m of this.config.members) {
      lines.push(`  ${m.name} (${m.role}): ${m.status}`);
    }
    return lines.join("\n");
  }

  memberNames(): string[] {
    return this.config.members.map((m) => m.name);
  }
}
