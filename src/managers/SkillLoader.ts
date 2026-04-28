import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import type { Skill, SkillMeta } from "../types/index.js";

export class SkillLoader {
  skills: Record<string, Skill> = {};

  static async load(skillsDir: string): Promise<SkillLoader> {
    const loader = new SkillLoader();
    if (existsSync(skillsDir)) {
      await loader.loadDir(skillsDir);
    }
    return loader;
  }

  private constructor() {}

  private async loadDir(dir: string): Promise<void> {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await this.loadDir(full);
      } else if (item.name === "SKILL.md") {
        const text = await fs.readFile(full, "utf-8");
        const match = text.match(/^---\n(.*?)\n---\n(.*)/s);
        const meta: SkillMeta = {};
        let body = text;
        if (match) {
          for (const line of match[1].trim().split("\n")) {
            const idx = line.indexOf(":");
            if (idx > -1) {
              meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            }
          }
          body = match[2].trim();
        }
        const name = meta.name || path.basename(path.dirname(full));
        this.skills[name] = { meta, body };
      }
    }
  }

  descriptions(): string {
    const keys = Object.keys(this.skills);
    if (!keys.length) return "(no skills)";
    return keys.map((n) => `  - ${n}: ${this.skills[n].meta.description || "-"}`).join("\n");
  }

  load(name: string): string {
    const s = this.skills[name];
    if (!s) {
      return `Error: Unknown skill '${name}'. Available: ${Object.keys(this.skills).join(", ")}`;
    }
    return `<skill name="${name}">\n${s.body}\n</skill>`;
  }
}
