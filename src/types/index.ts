// Domain types for the agent harness

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

export interface Task {
  id: number;
  subject: string;
  description: string;
  status: TodoStatus | "deleted";
  owner: string | null;
  blockedBy: number[];
}

export interface BgTask {
  status: string;
  command: string;
  result?: string;
}

export interface BgNotification {
  task_id: string;
  status: string;
  result: string;
}

export interface Message {
  type: string;
  from: string;
  content: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface TeamConfig {
  team_name: string;
  members: Teammate[];
}

export interface Teammate {
  name: string;
  role: string;
  status: string;
}

export interface SkillMeta {
  name?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface Skill {
  meta: SkillMeta;
  body: string;
}

export interface ShutdownRequest {
  target: string;
  status: string;
}

export interface PlanRequest {
  from: string;
  status: string;
}
