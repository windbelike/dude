import { describe, expect, it } from "vitest";
import {
  BackgroundRunInput,
  BashInput,
  BroadcastInput,
  ClaimTaskInput,
  EditFileInput,
  PlanApprovalInput,
  ReadFileInput,
  SendMessageInput,
  ShutdownRequestInput,
  SpawnTeammateInput,
  TaskCreateInput,
  TaskGetInput,
  TaskInput,
  TaskUpdateInput,
  TodoWriteInput,
  WriteFileInput,
} from "./tools.js";

describe("BashInput", () => {
  it("accepts valid input", () => {
    expect(BashInput.parse({ command: "ls" })).toEqual({ command: "ls" });
  });
  it("rejects missing command", () => {
    expect(() => BashInput.parse({})).toThrow();
  });
});

describe("ReadFileInput", () => {
  it("accepts path only", () => {
    expect(ReadFileInput.parse({ path: "foo.ts" })).toEqual({ path: "foo.ts" });
  });
  it("accepts path and limit", () => {
    expect(ReadFileInput.parse({ path: "foo.ts", limit: 10 })).toEqual({
      path: "foo.ts",
      limit: 10,
    });
  });
  it("rejects non-integer limit", () => {
    expect(() => ReadFileInput.parse({ path: "foo.ts", limit: 1.5 })).toThrow();
  });
});

describe("WriteFileInput", () => {
  it("accepts valid input", () => {
    expect(WriteFileInput.parse({ path: "foo.ts", content: "hello" })).toEqual({
      path: "foo.ts",
      content: "hello",
    });
  });
  it("rejects missing content", () => {
    expect(() => WriteFileInput.parse({ path: "foo.ts" })).toThrow();
  });
});

describe("EditFileInput", () => {
  it("accepts valid input", () => {
    expect(EditFileInput.parse({ path: "foo.ts", old_text: "a", new_text: "b" })).toEqual({
      path: "foo.ts",
      old_text: "a",
      new_text: "b",
    });
  });
});

describe("TodoWriteInput", () => {
  it("accepts valid items", () => {
    expect(
      TodoWriteInput.parse({
        items: [{ content: "test", status: "pending", activeForm: "Testing" }],
      }),
    ).toEqual({
      items: [{ content: "test", status: "pending", activeForm: "Testing" }],
    });
  });
  it("rejects invalid status", () => {
    expect(() =>
      TodoWriteInput.parse({
        items: [{ content: "test", status: "invalid", activeForm: "Testing" }],
      }),
    ).toThrow();
  });
});

describe("TaskInput", () => {
  it("accepts prompt only", () => {
    expect(TaskInput.parse({ prompt: "hello" })).toEqual({ prompt: "hello" });
  });
  it("accepts valid agent_type", () => {
    expect(TaskInput.parse({ prompt: "hello", agent_type: "Explore" })).toEqual({
      prompt: "hello",
      agent_type: "Explore",
    });
  });
  it("rejects invalid agent_type", () => {
    expect(() => TaskInput.parse({ prompt: "hello", agent_type: "bad" })).toThrow();
  });
});

describe("BackgroundRunInput", () => {
  it("accepts command only", () => {
    expect(BackgroundRunInput.parse({ command: "sleep 1" })).toEqual({ command: "sleep 1" });
  });
  it("accepts with timeout", () => {
    expect(BackgroundRunInput.parse({ command: "sleep 1", timeout: 30 })).toEqual({
      command: "sleep 1",
      timeout: 30,
    });
  });
});

describe("TaskCreateInput", () => {
  it("accepts subject only", () => {
    expect(TaskCreateInput.parse({ subject: "Do thing" })).toEqual({ subject: "Do thing" });
  });
  it("accepts with description", () => {
    expect(TaskCreateInput.parse({ subject: "Do thing", description: "Details" })).toEqual({
      subject: "Do thing",
      description: "Details",
    });
  });
});

describe("TaskGetInput", () => {
  it("accepts integer task_id", () => {
    expect(TaskGetInput.parse({ task_id: 5 })).toEqual({ task_id: 5 });
  });
  it("rejects string task_id", () => {
    expect(() => TaskGetInput.parse({ task_id: "5" })).toThrow();
  });
});

describe("TaskUpdateInput", () => {
  it("accepts valid status", () => {
    expect(TaskUpdateInput.parse({ task_id: 1, status: "completed" })).toEqual({
      task_id: 1,
      status: "completed",
    });
  });
  it("accepts blocked_by arrays", () => {
    expect(
      TaskUpdateInput.parse({ task_id: 1, add_blocked_by: [2, 3], remove_blocked_by: [4] }),
    ).toEqual({
      task_id: 1,
      add_blocked_by: [2, 3],
      remove_blocked_by: [4],
    });
  });
});

describe("SpawnTeammateInput", () => {
  it("requires all fields", () => {
    expect(() => SpawnTeammateInput.parse({ name: "Alice" })).toThrow();
  });
  it("accepts valid input", () => {
    expect(
      SpawnTeammateInput.parse({ name: "Alice", role: "explorer", prompt: "Go explore" }),
    ).toEqual({ name: "Alice", role: "explorer", prompt: "Go explore" });
  });
});

describe("SendMessageInput", () => {
  it("requires to and content", () => {
    expect(() => SendMessageInput.parse({})).toThrow();
  });
  it("accepts optional msg_type", () => {
    expect(SendMessageInput.parse({ to: "Alice", content: "hi", msg_type: "broadcast" })).toEqual({
      to: "Alice",
      content: "hi",
      msg_type: "broadcast",
    });
  });
});

describe("BroadcastInput", () => {
  it("requires content", () => {
    expect(() => BroadcastInput.parse({})).toThrow();
  });
  it("accepts valid input", () => {
    expect(BroadcastInput.parse({ content: "hello all" })).toEqual({ content: "hello all" });
  });
});

describe("ShutdownRequestInput", () => {
  it("requires teammate", () => {
    expect(() => ShutdownRequestInput.parse({})).toThrow();
  });
});

describe("PlanApprovalInput", () => {
  it("requires request_id and approve", () => {
    expect(() => PlanApprovalInput.parse({})).toThrow();
  });
  it("accepts valid input", () => {
    expect(PlanApprovalInput.parse({ request_id: "abc", approve: true })).toEqual({
      request_id: "abc",
      approve: true,
    });
  });
});

describe("ClaimTaskInput", () => {
  it("requires integer task_id", () => {
    expect(() => ClaimTaskInput.parse({ task_id: "1" })).toThrow();
  });
  it("accepts valid input", () => {
    expect(ClaimTaskInput.parse({ task_id: 7 })).toEqual({ task_id: 7 });
  });
});
