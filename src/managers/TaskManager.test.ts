import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TASKS_DIR } from "../lib/config.js";
import { TaskManager } from "./TaskManager.js";

describe("TaskManager", () => {
  beforeEach(async () => {
    // Clean tasks dir before each test
    if (existsSync(TASKS_DIR)) {
      const files = await fs.readdir(TASKS_DIR);
      for (const f of files) {
        await fs.unlink(path.join(TASKS_DIR, f));
      }
    }
  });

  afterEach(async () => {
    // Clean up after tests
    if (existsSync(TASKS_DIR)) {
      const files = await fs.readdir(TASKS_DIR);
      for (const f of files) {
        await fs.unlink(path.join(TASKS_DIR, f));
      }
    }
  });

  it("creates a task", async () => {
    const mgr = new TaskManager();
    const result = await mgr.create("Test task", "Do something");
    const task = JSON.parse(result);
    expect(task.subject).toBe("Test task");
    expect(task.description).toBe("Do something");
    expect(task.status).toBe("pending");
    expect(task.id).toBe(1);
  });

  it("increments ids", async () => {
    const mgr = new TaskManager();
    const t1 = JSON.parse(await mgr.create("First"));
    const t2 = JSON.parse(await mgr.create("Second"));
    expect(t1.id).toBe(1);
    expect(t2.id).toBe(2);
  });

  it("gets a task by id", async () => {
    const mgr = new TaskManager();
    await mgr.create("Get me", "Details");
    const got = JSON.parse(await mgr.get(1));
    expect(got.subject).toBe("Get me");
  });

  it("throws on missing task", async () => {
    const mgr = new TaskManager();
    await expect(mgr.get(999)).rejects.toThrow("Task 999 not found");
  });

  it("lists all tasks", async () => {
    const mgr = new TaskManager();
    await mgr.create("A");
    await mgr.create("B");
    const list = await mgr.listAll();
    expect(list).toContain("#1: A");
    expect(list).toContain("#2: B");
  });

  it("returns no tasks when empty", async () => {
    const mgr = new TaskManager();
    expect(await mgr.listAll()).toBe("No tasks.");
  });

  it("claims a task", async () => {
    const mgr = new TaskManager();
    await mgr.create("Claimable");
    const result = await mgr.claim(1, "alice");
    expect(result).toBe("Claimed task #1 for alice");
    const task = JSON.parse(await mgr.get(1));
    expect(task.status).toBe("in_progress");
    expect(task.owner).toBe("alice");
  });

  it("updates status", async () => {
    const mgr = new TaskManager();
    await mgr.create("Updatable");
    const result = await mgr.update(1, "completed");
    const task = JSON.parse(result);
    expect(task.status).toBe("completed");
  });

  it("deletes a task", async () => {
    const mgr = new TaskManager();
    await mgr.create("Deletable");
    const result = await mgr.update(1, "deleted");
    expect(result).toBe("Task 1 deleted");
    await expect(mgr.get(1)).rejects.toThrow();
  });

  it("manages blocked_by dependencies", async () => {
    const mgr = new TaskManager();
    await mgr.create("A");
    await mgr.create("B");
    await mgr.update(2, undefined, [1]);
    const task = JSON.parse(await mgr.get(2));
    expect(task.blockedBy).toContain(1);

    await mgr.update(2, undefined, undefined, [1]);
    const task2 = JSON.parse(await mgr.get(2));
    expect(task2.blockedBy).not.toContain(1);
  });

  it("clears blocked_by when dependency completes", async () => {
    const mgr = new TaskManager();
    await mgr.create("Dep");
    await mgr.create("Blocked");
    await mgr.update(2, undefined, [1]);

    await mgr.update(1, "completed");
    const blocked = JSON.parse(await mgr.get(2));
    expect(blocked.blockedBy).toHaveLength(0);
  });
});
