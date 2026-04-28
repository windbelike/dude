import { z } from "zod";

export const BashInput = z.object({
  command: z.string(),
});
export type BashInput = z.infer<typeof BashInput>;

export const ReadFileInput = z.object({
  path: z.string(),
  limit: z.number().int().optional(),
});
export type ReadFileInput = z.infer<typeof ReadFileInput>;

export const WriteFileInput = z.object({
  path: z.string(),
  content: z.string(),
});
export type WriteFileInput = z.infer<typeof WriteFileInput>;

export const EditFileInput = z.object({
  path: z.string(),
  old_text: z.string(),
  new_text: z.string(),
});
export type EditFileInput = z.infer<typeof EditFileInput>;

export const TodoItemInput = z.object({
  content: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
  activeForm: z.string().optional(),
});
export type TodoItemInput = z.infer<typeof TodoItemInput>;

export const TodoWriteInput = z.object({
  items: z.array(TodoItemInput),
});
export type TodoWriteInput = z.infer<typeof TodoWriteInput>;

export const TaskInput = z.object({
  prompt: z.string(),
  agent_type: z.enum(["Explore", "general-purpose"]).optional(),
});
export type TaskInput = z.infer<typeof TaskInput>;

export const LoadSkillInput = z.object({
  name: z.string(),
});
export type LoadSkillInput = z.infer<typeof LoadSkillInput>;

export const BackgroundRunInput = z.object({
  command: z.string(),
  timeout: z.number().int().optional(),
});
export type BackgroundRunInput = z.infer<typeof BackgroundRunInput>;

export const CheckBackgroundInput = z.object({
  task_id: z.string().optional(),
});
export type CheckBackgroundInput = z.infer<typeof CheckBackgroundInput>;

export const TaskCreateInput = z.object({
  subject: z.string(),
  description: z.string().optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;

export const TaskGetInput = z.object({
  task_id: z.number().int(),
});
export type TaskGetInput = z.infer<typeof TaskGetInput>;

export const TaskUpdateInput = z.object({
  task_id: z.number().int(),
  status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional(),
  add_blocked_by: z.array(z.number().int()).optional(),
  remove_blocked_by: z.array(z.number().int()).optional(),
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;

export const SpawnTeammateInput = z.object({
  name: z.string(),
  role: z.string(),
  prompt: z.string(),
});
export type SpawnTeammateInput = z.infer<typeof SpawnTeammateInput>;

export const SendMessageInput = z.object({
  to: z.string(),
  content: z.string(),
  msg_type: z.string().optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const BroadcastInput = z.object({
  content: z.string(),
});
export type BroadcastInput = z.infer<typeof BroadcastInput>;

export const ShutdownRequestInput = z.object({
  teammate: z.string(),
});
export type ShutdownRequestInput = z.infer<typeof ShutdownRequestInput>;

export const PlanApprovalInput = z.object({
  request_id: z.string(),
  approve: z.boolean(),
  feedback: z.string().optional(),
});
export type PlanApprovalInput = z.infer<typeof PlanApprovalInput>;

export const ClaimTaskInput = z.object({
  task_id: z.number().int(),
});
export type ClaimTaskInput = z.infer<typeof ClaimTaskInput>;
