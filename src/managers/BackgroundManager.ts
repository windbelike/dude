import { exec } from "node:child_process";
import {
  BASH_MAX_BUFFER,
  BG_NOTIFICATION_TRUNCATE,
  MAX_OUTPUT_LENGTH,
  WORKDIR,
} from "../lib/config.js";
import { simpleUuid } from "../lib/utils.js";
import type { BgNotification, BgTask } from "../types/index.js";

export class BackgroundManager {
  tasks: Record<string, BgTask> = {};
  notifications: BgNotification[] = [];

  run(command: string, timeout = 120): string {
    const tid = simpleUuid().slice(0, 8);
    this.tasks[tid] = { status: "running", command };

    exec(
      command,
      { cwd: WORKDIR, timeout: timeout * 1000, maxBuffer: BASH_MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          this.tasks[tid].status = "error";
          this.tasks[tid].result = String(err.message).slice(0, MAX_OUTPUT_LENGTH);
        } else {
          this.tasks[tid].status = "completed";
          this.tasks[tid].result =
            ((stdout || "") + (stderr || "")).trim().slice(0, MAX_OUTPUT_LENGTH) || "(no output)";
        }
        this.notifications.push({
          task_id: tid,
          status: this.tasks[tid].status,
          result: (this.tasks[tid].result || "").slice(0, BG_NOTIFICATION_TRUNCATE),
        });
      },
    );

    return `Background task ${tid} started: ${command.slice(0, 80)}`;
  }

  check(tid?: string): string {
    if (tid) {
      const t = this.tasks[tid];
      return t ? `[${t.status}] ${t.result || "(running)"}` : `Unknown: ${tid}`;
    }
    const entries = Object.entries(this.tasks);
    if (!entries.length) return "No bg tasks.";
    return entries.map(([k, v]) => `${k}: [${v.status}] ${v.command.slice(0, 60)}`).join("\n");
  }

  drain(): BgNotification[] {
    const notifs = [...this.notifications];
    this.notifications = [];
    return notifs;
  }
}
