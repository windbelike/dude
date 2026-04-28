#!/usr/bin/env tsx

// Harness: all mechanisms combined -- the complete cockpit for the model.
/**
 * harnessAgent.ts - Full Reference Agent
 *
 * Capstone implementation combining every mechanism from s01-s11.
 */

import { promises as fs } from "node:fs";
import { agentLoop } from "../core/agent-loop.js";
import { buildSystemPrompt } from "../core/system-prompt.js";
import { INBOX_DIR, SKILLS_DIR, TASKS_DIR, TEAM_DIR } from "../lib/config.js";
import { BackgroundManager } from "../managers/BackgroundManager.js";
import { MessageBus } from "../managers/MessageBus.js";
import { SkillLoader } from "../managers/SkillLoader.js";
import { TaskManager } from "../managers/TaskManager.js";
import { TeammateManager } from "../managers/TeammateManager.js";
import { TodoManager } from "../managers/TodoManager.js";
import { autoCompact } from "../services/compression.js";
import type { AgentContext } from "../services/tool-registry.js";
import type { MessageParam } from "../types/anthropic.js";

async function main(): Promise<void> {
  // Ensure dirs exist
  await fs.mkdir(TASKS_DIR, { recursive: true });
  await fs.mkdir(TEAM_DIR, { recursive: true });
  await fs.mkdir(INBOX_DIR, { recursive: true });

  // Initialize managers (async init fixes the SkillLoader race condition)
  const todo = new TodoManager();
  const skills = await SkillLoader.load(SKILLS_DIR);
  const taskMgr = new TaskManager();
  const bg = new BackgroundManager();
  const bus = new MessageBus();
  const team = new TeammateManager(bus, taskMgr);
  await team.init();

  const ctx: AgentContext = { todo, skills, taskMgr, bg, bus, team };
  const systemPrompt = buildSystemPrompt(skills);

  // REPL
  const history: MessageParam[] = [];
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[36ms_full >> \x1b[0m",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const query = line.trim();
    if (["q", "exit", ""].includes(query.toLowerCase())) {
      rl.close();
      return;
    }
    if (query === "/compact") {
      if (history.length) {
        console.log("[manual compact via /compact]");
        history.splice(0, history.length, ...(await autoCompact(history)));
      }
      rl.prompt();
      return;
    }
    if (query === "/tasks") {
      console.log(await ctx.taskMgr.listAll());
      rl.prompt();
      return;
    }
    if (query === "/team") {
      console.log(ctx.team.listAll());
      rl.prompt();
      return;
    }
    if (query === "/inbox") {
      console.log(JSON.stringify(await ctx.bus.readInbox("lead"), null, 2));
      rl.prompt();
      return;
    }
    history.push({ role: "user", content: query });
    await agentLoop(history, ctx, systemPrompt);

    const last = history[history.length - 1];
    if (typeof last.content !== "string") {
      for (const block of last.content) {
        if (block.type === "text") {
          console.log(block.text);
        }
      }
    }
    console.log();
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
