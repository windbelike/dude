import { describe, expect, it } from "vitest";
import { BackgroundManager } from "./BackgroundManager.js";

describe("BackgroundManager", () => {
  it("starts a task and returns a short id", () => {
    const bg = new BackgroundManager();
    const result = bg.run("echo hello");
    expect(result).toMatch(/^Background task [a-z0-9]{8} started:/);
  });

  it("lists running tasks", () => {
    const bg = new BackgroundManager();
    bg.run("sleep 10");
    const list = bg.check();
    expect(list).toContain("[running]");
    expect(list).toContain("sleep 10");
  });

  it("checks a specific task", () => {
    const bg = new BackgroundManager();
    const start = bg.run("echo hello");
    const tid = start.split(" ")[2];
    const check = bg.check(tid);
    expect(check).toMatch(/\[(running|completed|error)\]/);
  });

  it("returns unknown for invalid task id", () => {
    const bg = new BackgroundManager();
    expect(bg.check("badid")).toBe("Unknown: badid");
  });

  it("returns no tasks when empty", () => {
    const bg = new BackgroundManager();
    expect(bg.check()).toBe("No bg tasks.");
  });

  it("drains notifications", () => {
    const bg = new BackgroundManager();
    bg.run("echo hello");
    // Give it a tiny moment to potentially finish (though usually still running)
    const notifs1 = bg.drain();
    // Drain should return whatever is there and clear the queue
    const notifs2 = bg.drain();
    expect(Array.isArray(notifs1)).toBe(true);
    expect(Array.isArray(notifs2)).toBe(true);
    expect(notifs2.length).toBe(0);
  });
});
