import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INBOX_DIR } from "../lib/config.js";
import { MessageBus } from "./MessageBus.js";

describe("MessageBus", () => {
  beforeEach(async () => {
    if (existsSync(INBOX_DIR)) {
      const files = await fs.readdir(INBOX_DIR);
      for (const f of files) {
        await fs.unlink(path.join(INBOX_DIR, f));
      }
    }
  });

  afterEach(async () => {
    if (existsSync(INBOX_DIR)) {
      const files = await fs.readdir(INBOX_DIR);
      for (const f of files) {
        await fs.unlink(path.join(INBOX_DIR, f));
      }
    }
  });

  it("sends and reads messages", async () => {
    const bus = new MessageBus();
    const sendResult = await bus.send("lead", "test-agent", "hello there");
    expect(sendResult).toBe("Sent message to test-agent");

    const inbox = await bus.readInbox("test-agent");
    expect(inbox.length).toBe(1);
    expect(inbox[0].from).toBe("lead");
    expect(inbox[0].content).toBe("hello there");
    expect(inbox[0].type).toBe("message");
  });

  it("returns empty inbox when no messages", async () => {
    const bus = new MessageBus();
    const inbox = await bus.readInbox("nonexistent");
    expect(inbox).toEqual([]);
  });

  it("broadcasts to multiple recipients", async () => {
    const bus = new MessageBus();
    const result = await bus.broadcast("lead", "team meeting", ["a", "b", "c"]);
    expect(result).toBe("Broadcast to 3 teammates");

    const inboxA = await bus.readInbox("a");
    const inboxB = await bus.readInbox("b");
    const inboxC = await bus.readInbox("c");

    expect(inboxA.length).toBe(1);
    expect(inboxB.length).toBe(1);
    expect(inboxC.length).toBe(1);
    expect(inboxA[0].content).toBe("team meeting");
  });

  it("drains inbox on read", async () => {
    const bus = new MessageBus();
    await bus.send("lead", "drain-test", "msg1");
    const first = await bus.readInbox("drain-test");
    expect(first.length).toBe(1);
    const second = await bus.readInbox("drain-test");
    expect(second.length).toBe(0);
  });
});
