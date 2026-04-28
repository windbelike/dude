import { exec, execSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { BASH_MAX_BUFFER, BASH_TIMEOUT_MS, MAX_OUTPUT_LENGTH, WORKDIR } from "./config.js";

const execAsync = promisify(exec);

export function safePath(p: string): string {
  const resolved = path.resolve(WORKDIR, p);
  const relative = path.relative(WORKDIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return resolved;
}

export async function runBash(command: string): Promise<string> {
  const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];
  if (dangerous.some((d) => command.includes(d))) {
    return "Error: Dangerous command blocked";
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: WORKDIR,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_BUFFER,
    });
    const out = (stdout + stderr).trim();
    return out.slice(0, MAX_OUTPUT_LENGTH) || "(no output)";
  } catch (err: unknown) {
    const e = err as { killed?: boolean; signal?: string; message: string };
    if (e.killed || e.signal) {
      return "Error: Timeout (120s)";
    }
    return `Error: ${e.message}`;
  }
}

export function runBashSync(command: string): string {
  const dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];
  if (dangerous.some((d) => command.includes(d))) {
    return "Error: Dangerous command blocked";
  }
  try {
    const buf = execSync(command, {
      cwd: WORKDIR,
      timeout: BASH_TIMEOUT_MS,
      encoding: "utf-8",
    });
    const out = (buf || "").trim();
    return out.slice(0, MAX_OUTPUT_LENGTH) || "(no output)";
  } catch (err: unknown) {
    const e = err as { status?: number | null; message: string; stderr?: string };
    if (e.status === null) {
      return "Error: Timeout (120s)";
    }
    return `Error: ${e.message}\n${e.stderr || ""}`.trim().slice(0, MAX_OUTPUT_LENGTH);
  }
}

export async function runRead(filePath: string, limit?: number): Promise<string> {
  try {
    const text = await fs.readFile(safePath(filePath), "utf-8");
    const lines = text.split("\n");
    if (limit && limit < lines.length) {
      lines.splice(limit, lines.length - limit, `... (${lines.length - limit} more lines)`);
    }
    return lines.join("\n").slice(0, MAX_OUTPUT_LENGTH);
  } catch (e: unknown) {
    const err = e as { message: string };
    return `Error: ${err.message}`;
  }
}

export async function runWrite(filePath: string, content: string): Promise<string> {
  try {
    const fp = safePath(filePath);
    const dir = path.dirname(fp);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(fp, content, "utf-8");
    return `Wrote ${content.length} bytes to ${filePath}`;
  } catch (e: unknown) {
    const err = e as { message: string };
    return `Error: ${err.message}`;
  }
}

export async function runEdit(filePath: string, oldText: string, newText: string): Promise<string> {
  try {
    const fp = safePath(filePath);
    const content = await fs.readFile(fp, "utf-8");
    if (!content.includes(oldText)) {
      return `Error: Text not found in ${filePath}`;
    }
    await fs.writeFile(fp, content.replace(oldText, newText), "utf-8");
    return `Edited ${filePath}`;
  } catch (e: unknown) {
    const err = e as { message: string };
    return `Error: ${err.message}`;
  }
}
