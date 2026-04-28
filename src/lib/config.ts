import * as path from "node:path";
import process from "node:process";

export const WORKDIR = process.cwd();

export const TEAM_DIR = path.join(WORKDIR, ".team");
export const INBOX_DIR = path.join(TEAM_DIR, "inbox");
export const TASKS_DIR = path.join(WORKDIR, ".tasks");
export const SKILLS_DIR = path.join(WORKDIR, "skills");
export const TRANSCRIPT_DIR = path.join(WORKDIR, ".transcripts");

export const TOKEN_THRESHOLD = 100_000;
export const POLL_INTERVAL_SECONDS = 5;
export const IDLE_TIMEOUT_SECONDS = 60;
export const MAX_OUTPUT_LENGTH = 50_000;
export const MAX_TOKENS = 8000;
export const COMPACT_SUMMARY_MAX_TOKENS = 2000;
export const MAX_TODOS = 20;
export const AGENT_LOOP_MAX_ROUNDS = 50;
export const SUBAGENT_MAX_ROUNDS = 30;
export const BASH_TIMEOUT_MS = 120_000;
export const BASH_MAX_BUFFER = 1024 * 1024;
export const BG_TRUNCATE_LENGTH = 500;
export const BG_NOTIFICATION_TRUNCATE = 500;

export const VALID_MSG_TYPES = new Set([
  "message",
  "broadcast",
  "shutdown_request",
  "shutdown_response",
  "plan_approval_response",
]);
