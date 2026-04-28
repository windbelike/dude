import { describe, expect, it } from "vitest";
import { TodoManager } from "./TodoManager.js";

describe("TodoManager", () => {
  it("renders empty state", () => {
    const mgr = new TodoManager();
    expect(mgr.render()).toBe("No todos.");
    expect(mgr.hasOpenItems()).toBe(false);
  });

  it("adds and renders todos", () => {
    const mgr = new TodoManager();
    mgr.update([
      { content: "A", status: "pending", activeForm: "Doing A" },
      { content: "B", status: "in_progress", activeForm: "Doing B" },
    ]);
    expect(mgr.render()).toContain("[ ] A");
    expect(mgr.render()).toContain("[>] B <- Doing B");
    expect(mgr.hasOpenItems()).toBe(true);
  });

  it("validates max 20 todos", () => {
    const mgr = new TodoManager();
    const items = Array.from({ length: 21 }, (_, i) => ({
      content: `Task ${i}`,
      status: "pending" as const,
      activeForm: `Task ${i}`,
    }));
    expect(() => mgr.update(items)).toThrow("Max 20 todos");
  });

  it("validates single in_progress", () => {
    const mgr = new TodoManager();
    expect(() =>
      mgr.update([
        { content: "A", status: "in_progress", activeForm: "A" },
        { content: "B", status: "in_progress", activeForm: "B" },
      ]),
    ).toThrow("Only one in_progress allowed");
  });

  it("validates missing content", () => {
    const mgr = new TodoManager();
    expect(() => mgr.update([{ content: "", status: "pending", activeForm: "X" }])).toThrow(
      "content required",
    );
  });

  it("validates missing activeForm", () => {
    const mgr = new TodoManager();
    expect(() => mgr.update([{ content: "A", status: "pending", activeForm: "" }])).toThrow(
      "activeForm required",
    );
  });

  it("tracks completion count", () => {
    const mgr = new TodoManager();
    mgr.update([
      { content: "A", status: "completed", activeForm: "A" },
      { content: "B", status: "pending", activeForm: "B" },
    ]);
    expect(mgr.render()).toContain("(1/2 completed)");
    expect(mgr.hasOpenItems()).toBe(true);
  });

  it("hasOpenItems returns false when all completed", () => {
    const mgr = new TodoManager();
    mgr.update([{ content: "A", status: "completed", activeForm: "A" }]);
    expect(mgr.hasOpenItems()).toBe(false);
  });
});
