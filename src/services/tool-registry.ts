import { z } from "zod";
import { VALID_MSG_TYPES } from "../lib/config.js";
import { runBash, runEdit, runRead, runWrite } from "../lib/tools.js";
import type { BackgroundManager } from "../managers/BackgroundManager.js";
import type { MessageBus } from "../managers/MessageBus.js";
import type { SkillLoader } from "../managers/SkillLoader.js";
import type { TaskManager } from "../managers/TaskManager.js";
import type { TeammateManager } from "../managers/TeammateManager.js";
import type { TodoManager } from "../managers/TodoManager.js";
import type { Tool, ToolUseBlock } from "../types/anthropic.js";
import {
  BackgroundRunInput,
  BashInput,
  BroadcastInput,
  CheckBackgroundInput,
  ClaimTaskInput,
  EditFileInput,
  LoadSkillInput,
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
} from "../validators/tools.js";
import { runSubagent } from "./subagent.js";

export interface AgentContext {
  todo: TodoManager;
  skills: SkillLoader;
  taskMgr: TaskManager;
  bg: BackgroundManager;
  bus: MessageBus;
  team: TeammateManager;
}

export interface ToolEntry {
  name: string;
  description: string;
  schema: z.ZodType<unknown>;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown, ctx: AgentContext) => Promise<string>;
}

function mkTool<Input>(
  name: string,
  description: string,
  schema: z.ZodType<Input>,
  inputSchema: Record<string, unknown>,
  handler: (input: Input, ctx: AgentContext) => Promise<string>,
): ToolEntry {
  return {
    name,
    description,
    schema: schema as z.ZodType<unknown>,
    inputSchema,
    handler: (input: unknown, ctx: AgentContext) => handler(input as Input, ctx),
  };
}

export const TOOL_REGISTRY: ToolEntry[] = [
  mkTool(
    "bash",
    "Run a shell command.",
    BashInput,
    { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    (input) => runBash(input.command),
  ),

  mkTool(
    "read_file",
    "Read file contents.",
    ReadFileInput,
    {
      type: "object",
      properties: { path: { type: "string" }, limit: { type: "integer" } },
      required: ["path"],
    },
    (input) => runRead(input.path, input.limit),
  ),

  mkTool(
    "write_file",
    "Write content to file.",
    WriteFileInput,
    {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    (input) => runWrite(input.path, input.content),
  ),

  mkTool(
    "edit_file",
    "Replace exact text in file.",
    EditFileInput,
    {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
    (input) => runEdit(input.path, input.old_text, input.new_text),
  ),

  mkTool(
    "TodoWrite",
    "Update task tracking list.",
    TodoWriteInput,
    {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              activeForm: { type: "string" },
            },
            required: ["content", "status", "activeForm"],
          },
        },
      },
      required: ["items"],
    },
    (input, ctx) => Promise.resolve(ctx.todo.update(input.items)),
  ),

  mkTool(
    "task",
    "Spawn a subagent for isolated exploration or work.",
    TaskInput,
    {
      type: "object",
      properties: {
        prompt: { type: "string" },
        agent_type: { type: "string", enum: ["Explore", "general-purpose"] },
      },
      required: ["prompt"],
    },
    (input) => runSubagent(input.prompt, input.agent_type),
  ),

  mkTool(
    "load_skill",
    "Load specialized knowledge by name.",
    LoadSkillInput,
    { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    (input, ctx) => Promise.resolve(ctx.skills.load(input.name)),
  ),

  mkTool(
    "compress",
    "Manually compress conversation context.",
    z.object({}),
    { type: "object", properties: {} },
    () => Promise.resolve("Compressing..."),
  ),

  mkTool(
    "background_run",
    "Run command in background thread.",
    BackgroundRunInput,
    {
      type: "object",
      properties: { command: { type: "string" }, timeout: { type: "integer" } },
      required: ["command"],
    },
    (input, ctx) => Promise.resolve(ctx.bg.run(input.command, input.timeout)),
  ),

  mkTool(
    "check_background",
    "Check background task status.",
    CheckBackgroundInput,
    { type: "object", properties: { task_id: { type: "string" } } },
    (input, ctx) => Promise.resolve(ctx.bg.check(input.task_id)),
  ),

  mkTool(
    "task_create",
    "Create a persistent file task.",
    TaskCreateInput,
    {
      type: "object",
      properties: { subject: { type: "string" }, description: { type: "string" } },
      required: ["subject"],
    },
    (input, ctx) => ctx.taskMgr.create(input.subject, input.description),
  ),

  mkTool(
    "task_get",
    "Get task details by ID.",
    TaskGetInput,
    { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    (input, ctx) => ctx.taskMgr.get(input.task_id),
  ),

  mkTool(
    "task_update",
    "Update task status or dependencies.",
    TaskUpdateInput,
    {
      type: "object",
      properties: {
        task_id: { type: "integer" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "deleted"] },
        add_blocked_by: { type: "array", items: { type: "integer" } },
        remove_blocked_by: { type: "array", items: { type: "integer" } },
      },
      required: ["task_id"],
    },
    (input, ctx) =>
      ctx.taskMgr.update(
        input.task_id,
        input.status,
        input.add_blocked_by,
        input.remove_blocked_by,
      ),
  ),

  mkTool(
    "task_list",
    "List all tasks.",
    z.object({}),
    { type: "object", properties: {} },
    (_input, ctx) => ctx.taskMgr.listAll(),
  ),

  mkTool(
    "spawn_teammate",
    "Spawn a persistent autonomous teammate.",
    SpawnTeammateInput,
    {
      type: "object",
      properties: {
        name: { type: "string" },
        role: { type: "string" },
        prompt: { type: "string" },
      },
      required: ["name", "role", "prompt"],
    },
    (input, ctx) => ctx.team.spawn(input.name, input.role, input.prompt),
  ),

  mkTool(
    "list_teammates",
    "List all teammates.",
    z.object({}),
    { type: "object", properties: {} },
    (_input, ctx) => Promise.resolve(ctx.team.listAll()),
  ),

  mkTool(
    "send_message",
    "Send a message to a teammate.",
    SendMessageInput,
    {
      type: "object",
      properties: {
        to: { type: "string" },
        content: { type: "string" },
        msg_type: { type: "string", enum: Array.from(VALID_MSG_TYPES) },
      },
      required: ["to", "content"],
    },
    (input, ctx) => ctx.bus.send("lead", input.to, input.content, input.msg_type),
  ),

  mkTool(
    "read_inbox",
    "Read and drain the lead's inbox.",
    z.object({}),
    { type: "object", properties: {} },
    (_input, ctx) => ctx.bus.readInbox("lead").then((msgs) => JSON.stringify(msgs, null, 2)),
  ),

  mkTool(
    "broadcast",
    "Send message to all teammates.",
    BroadcastInput,
    { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    (input, ctx) => ctx.bus.broadcast("lead", input.content, ctx.team.memberNames()),
  ),

  mkTool(
    "shutdown_request",
    "Request a teammate to shut down.",
    ShutdownRequestInput,
    { type: "object", properties: { teammate: { type: "string" } }, required: ["teammate"] },
    (input, ctx) => {
      const reqId = Math.random().toString(36).slice(2, 10);
      return ctx.bus
        .send("lead", input.teammate, "Please shut down.", "shutdown_request", {
          request_id: reqId,
        })
        .then(() => `Shutdown request ${reqId} sent to '${input.teammate}'`);
    },
  ),

  mkTool(
    "plan_approval",
    "Approve or reject a teammate's plan.",
    PlanApprovalInput,
    {
      type: "object",
      properties: {
        request_id: { type: "string" },
        approve: { type: "boolean" },
        feedback: { type: "string" },
      },
      required: ["request_id", "approve"],
    },
    () => Promise.resolve("Plan approval not implemented."),
  ),

  mkTool("idle", "Enter idle state.", z.object({}), { type: "object", properties: {} }, () =>
    Promise.resolve("Lead does not idle."),
  ),

  mkTool(
    "claim_task",
    "Claim a task from the board.",
    ClaimTaskInput,
    { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    (input, ctx) => ctx.taskMgr.claim(input.task_id, "lead"),
  ),
];

export function getToolList(): Tool[] {
  return TOOL_REGISTRY.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.inputSchema as Tool["input_schema"],
  }));
}

export async function dispatchTool(block: ToolUseBlock, ctx: AgentContext): Promise<string> {
  const def = TOOL_REGISTRY.find((d) => d.name === block.name);
  if (!def) return `Unknown tool: ${block.name}`;

  const parsed = def.schema.safeParse(block.input);
  if (!parsed.success) {
    return `Error: Invalid input for ${block.name}: ${parsed.error.message}`;
  }

  try {
    return await def.handler(parsed.data, ctx);
  } catch (e: unknown) {
    const err = e as { message: string };
    return `Error: ${err.message}`;
  }
}
