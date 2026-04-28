import { MAX_TODOS } from "../lib/config.js";
import type { TodoItem, TodoStatus } from "../types/index.js";

export class TodoManager {
  items: TodoItem[] = [];

  update(items: Array<Partial<TodoItem>>): string {
    const validated: TodoItem[] = [];
    let inProgressCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const content = String(item.content || "").trim();
      const status = String(item.status || "pending").toLowerCase() as TodoStatus;
      const activeForm = String(item.activeForm || "").trim();

      if (!content) throw new Error(`Item ${i}: content required`);
      if (!["pending", "in_progress", "completed"].includes(status)) {
        throw new Error(`Item ${i}: invalid status '${status}'`);
      }
      if (!activeForm) throw new Error(`Item ${i}: activeForm required`);
      if (status === "in_progress") inProgressCount++;

      validated.push({ content, status, activeForm });
    }

    if (validated.length > MAX_TODOS) throw new Error(`Max ${MAX_TODOS} todos`);
    if (inProgressCount > 1) throw new Error("Only one in_progress allowed");

    this.items = validated;
    return this.render();
  }

  render(): string {
    if (!this.items.length) return "No todos.";

    const statusMap: Record<TodoStatus, string> = {
      completed: "[x]",
      in_progress: "[>]",
      pending: "[ ]",
    };

    const lines: string[] = [];
    for (const item of this.items) {
      const marker = statusMap[item.status] || "[?]";
      const suffix = item.status === "in_progress" ? ` <- ${item.activeForm}` : "";
      lines.push(`${marker} ${item.content}${suffix}`);
    }

    const done = this.items.filter((t) => t.status === "completed").length;
    lines.push(`\n(${done}/${this.items.length} completed)`);
    return lines.join("\n");
  }

  hasOpenItems(): boolean {
    return this.items.some((item) => item.status !== "completed");
  }
}
