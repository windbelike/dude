import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { TASKS_DIR } from "../lib/config.js";
import type { Task } from "../types/index.js";

export class TaskManager {
  private taskPath(tid: number): string {
    return path.join(TASKS_DIR, `task_${tid}.json`);
  }

  private async nextId(): Promise<number> {
    const files = await fs.readdir(TASKS_DIR).catch(() => [] as string[]);
    const ids = files
      .filter((f) => f.startsWith("task_") && f.endsWith(".json"))
      .map((f) => {
        const parts = f.split("_");
        return parseInt(parts[1] ?? "0", 10);
      })
      .filter((n) => !Number.isNaN(n));
    return Math.max(0, ...ids) + 1;
  }

  private async load(tid: number): Promise<Task> {
    const p = this.taskPath(tid);
    if (!existsSync(p)) throw new Error(`Task ${tid} not found`);
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as Task;
  }

  private async save(task: Task): Promise<void> {
    await fs.writeFile(this.taskPath(task.id), JSON.stringify(task, null, 2), "utf-8");
  }

  async create(subject: string, description = ""): Promise<string> {
    const task: Task = {
      id: await this.nextId(),
      subject,
      description,
      status: "pending",
      owner: null,
      blockedBy: [],
    };
    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async get(tid: number): Promise<string> {
    return JSON.stringify(await this.load(tid), null, 2);
  }

  async update(
    tid: number,
    status?: string,
    addBlockedBy?: number[],
    removeBlockedBy?: number[],
  ): Promise<string> {
    const task = await this.load(tid);

    if (status) {
      task.status = status as Task["status"];
      if (status === "completed") {
        const files = await fs.readdir(TASKS_DIR).catch(() => [] as string[]);
        for (const f of files) {
          if (!f.startsWith("task_") || !f.endsWith(".json")) continue;
          const otherPath = path.join(TASKS_DIR, f);
          const otherRaw = await fs.readFile(otherPath, "utf-8");
          const other = JSON.parse(otherRaw) as Task;
          if ((other.blockedBy || []).includes(tid)) {
            other.blockedBy = (other.blockedBy || []).filter((x) => x !== tid);
            await fs.writeFile(otherPath, JSON.stringify(other, null, 2), "utf-8");
          }
        }
      }
      if (status === "deleted") {
        await fs.unlink(this.taskPath(tid)).catch(() => {});
        return `Task ${tid} deleted`;
      }
    }

    if (addBlockedBy) {
      task.blockedBy = Array.from(new Set([...(task.blockedBy || []), ...addBlockedBy]));
    }
    if (removeBlockedBy) {
      task.blockedBy = (task.blockedBy || []).filter((x) => !removeBlockedBy.includes(x));
    }

    await this.save(task);
    return JSON.stringify(task, null, 2);
  }

  async listAll(): Promise<string> {
    const files = await fs.readdir(TASKS_DIR).catch(() => [] as string[]);
    const tasks = await Promise.all(
      files
        .filter((f) => f.startsWith("task_") && f.endsWith(".json"))
        .sort()
        .map(async (f) => {
          const raw = await fs.readFile(path.join(TASKS_DIR, f), "utf-8");
          return JSON.parse(raw) as Task;
        }),
    );

    if (!tasks.length) return "No tasks.";

    const statusMap: Record<string, string> = {
      pending: "[ ]",
      in_progress: "[>]",
      completed: "[x]",
    };

    const lines: string[] = [];
    for (const t of tasks) {
      const marker = statusMap[t.status] || "[?]";
      const owner = t.owner ? ` @${t.owner}` : "";
      const blocked = t.blockedBy?.length ? ` (blocked by: ${t.blockedBy.join(", ")})` : "";
      lines.push(`${marker} #${t.id}: ${t.subject}${owner}${blocked}`);
    }
    return lines.join("\n");
  }

  async claim(tid: number, owner: string): Promise<string> {
    const task = await this.load(tid);
    task.owner = owner;
    task.status = "in_progress";
    await this.save(task);
    return `Claimed task #${tid} for ${owner}`;
  }
}
