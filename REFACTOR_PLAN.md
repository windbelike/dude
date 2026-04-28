# Refactor Plan: learn-claude-code-ts

## Project Snapshot
- **Size**: Small (3 source files, ~1200 LOC)
- **TypeScript**: 5.9.3, strict mode enabled, compiles clean
- **Build**: 0.09s type-check (fast)
- **Runtime**: Node 24, tsx for dev, tsc for build
- **Dependencies**: `@anthropic-ai/sdk`, `dotenv`
- **No tests, no linting, no formatting**

---

## Critical Issues Found

### 1. God File (`s_full.ts`: 1070 LOC)
Everything lives in one file: todos, tasks, background jobs, messaging, teammates, compression, subagents, tool dispatch, and the REPL. No separation of concerns.

### 2. `any` Pandemic
`TOOL_HANDLERS` is `Record<string, (input: any) => Promise<string>>`. `resp: any`, `msg: any`, `task: any`, `block: any` — strict mode is technically on, but runtime types are unchecked.

### 3. Race Condition on Boot
`SkillLoader` constructor fires an async `loadDir()` that is **never awaited**. The `SYSTEM` prompt immediately calls `SKILLS.descriptions()`, so skills may not be loaded when the first prompt is sent.

### 4. Duplicated Tool Schemas
The same tool definitions (bash, read_file, write_file, edit_file) are copy-pasted in:
- `runSubagent()`
- `TeammateManager.loop()`
- `TOOLS` array for the main agent

Change a description in one place, the others drift.

### 5. Sync `require()` in ESM-leaning Code
`tools.ts` uses `require("child_process")` inside `runBashSync()`. The project uses `NodeNext` module resolution. This is inconsistent and may break under pure ESM.

### 6. Global Mutable Singletons
```ts
const TODO = new TodoManager();
const SKILLS = new SkillLoader(SKILLS_DIR);
// ...
```
These are module-level globals. Testing or running two agents in the same process is impossible.

### 7. No Input Validation
Dangerous command filtering is a naive `.includes()` check. Tool inputs are passed straight to handlers without validation.

### 8. No Tests, No Lint, No Format
No safety net for refactors.

---

## Refactor Plan

### Phase 1: Tooling Foundation
**Goal: Add guardrails before touching code.**

1. **Add `type: "module"` to `package.json`**
   - Declare ESM intent explicitly.
   - Fix imports: remove `.js` extensions from TS sources (NodeNext resolution handles this).

2. **Add Biome** (single tool for lint + format, fast)
   - `npm install -D @biomejs/biome`
   - Enable recommended rules + `noExplicitAny`, `noConsoleLog` (allow in agents/), `useNodejsImportProtocol`
   - Scripts: `"lint": "biome check ."`, `"format": "biome format --write ."`

3. **Add Vitest**
   - `npm install -D vitest`
   - Script: `"test": "vitest run"`

4. **Add Zod**
   - `npm install zod`
   - Use for all tool input validation.

5. **Clean up `package.json` scripts**
   - Remove stale `s01`/`s02` references from README or add the scripts.

---

### Phase 2: Decompose the God File
**Goal: Split `s_full.ts` into cohesive modules.**

```
src/
  types/
    index.ts          # Domain types (Task, Todo, BgTask, Teammate, etc.)
  lib/
    client.ts         # (keep) Anthropic client
    tools.ts          # (keep) File/bash primitives
    config.ts         # Magic numbers & constants extracted
  validators/
    tools.ts          # Zod schemas for every tool input
  managers/
    TodoManager.ts
    TaskManager.ts
    BackgroundManager.ts
    MessageBus.ts
    SkillLoader.ts
    TeammateManager.ts
  services/
    compression.ts    # estimateTokens, microcompact, autoCompact
    subagent.ts       # runSubagent
    tool-registry.ts  # Central TOOLS + TOOL_HANDLERS definitions
  core/
    agent-loop.ts     # Main loop logic
    system-prompt.ts  # SYSTEM prompt builder
  agents/
    s_full.ts         # Thin REPL entry point (~100 LOC)
```

**Rules for extraction:**
- Each manager gets its own file with an exported class.
- No file > 250 LOC after extraction.
- Cross-cutting types live in `src/types/`.

---

### Phase 3: Fix Type Safety & Validation
**Goal: Eliminate `any` and add runtime validation.**

1. **Define tool schemas once**
   ```ts
   // validators/tools.ts
   export const BashInput = z.object({ command: z.string() });
   export type BashInput = z.infer<typeof BashInput>;
   ```

2. **Build a type-safe tool registry**
   ```ts
   // services/tool-registry.ts
   interface ToolDef<Input, Output = string> {
     name: string;
     description: string;
     schema: z.ZodType<Input>;
     handler: (input: Input, ctx: AgentContext) => Promise<Output>;
   }
   ```
   This replaces the loose `Record<string, (input: any) => Promise<string>>`.

3. **Fix `SkillLoader` async init**
   - Replace constructor-side-effect with `static async load(skillsDir: string): Promise<SkillLoader>`.
   - Or use an `async init()` method called before the REPL starts.

4. **Replace `any` in Anthropic SDK usage**
   - Use proper types from `@anthropic-ai/sdk` (`MessageParam`, `ToolUseBlock`, `TextBlock`).
   - No more `resp: any`.

---

### Phase 4: Fix Architecture Smells
**Goal: Make the codebase testable and robust.**

1. **Dependency Injection**
   - Create an `AgentContext` class/value object that holds all managers.
   - Pass `ctx` into handlers instead of relying on module-level globals.
   - Entry point constructs the context and passes it down.

2. **Result Types for Errors**
   - Replace the pattern of returning `Error: ...` strings with a `Result<T, AgentError>` type (or `neverthrow` if you want a library, or a simple union).
   - Prevents false positives where an error string looks like success to the LLM.

3. **Extract Constants**
   - Move `TOKEN_THRESHOLD`, `POLL_INTERVAL`, `IDLE_TIMEOUT`, `50_000`, `8000`, etc. into `src/lib/config.ts`.
   - Allow overrides via environment variables where sensible.

4. **Fix `runBashSync`**
   - Import `execSync` statically at the top of `tools.ts` using ESM syntax.
   - Or remove `runBashSync` entirely if unused (check first).

5. **Better Dangerous Command Filtering**
   - Use a parsed token check or a stricter regex instead of substring `.includes()`.
   - Example: `command.trim().startsWith("rm -rf /")` is not enough; tokenize or whitelist patterns.

6. **Add Error Logging**
   - `TeammateManager.loop` swallows API errors with a bare `catch`. Log the error before shutdown.

---

### Phase 5: Testing
**Goal: Verify behavior and prevent regressions.**

1. **Unit tests for managers**
   - `TodoManager`: validate status transitions, enforce single `in_progress`, max 20 items.
   - `TaskManager`: CRUD, blocked-by logic, deletion cleanup.
   - `BackgroundManager`: run/check/drain lifecycle.
   - `MessageBus`: send/readInbox/broadcast.

2. **Unit tests for validators**
   - Every Zod schema: valid input passes, invalid input throws.

3. **Unit tests for tool primitives**
   - `safePath`: rejects escapes, accepts valid paths.
   - `runBash`: mocks `execAsync`, checks timeout handling.

4. **Integration test**
   - `test-api.ts` already exists. Expand it into a Vitest test suite that mocks the Anthropic client (or uses a stub) to verify the agent loop processes a single round correctly.

5. **Type tests**
   - Use `expectTypeOf` from Vitest to assert that tool registry inference produces the expected handler argument types.

---

## Suggested Execution Order

| Order | Task | Estimated Effort |
|-------|------|------------------|
| 1 | Add Biome, Vitest, Zod; configure `type: "module"` | 15 min |
| 2 | Extract `src/types/index.ts` and `src/lib/config.ts` | 20 min |
| 3 | Extract validators with Zod schemas | 30 min |
| 4 | Split `s_full.ts` into managers + services | 60 min |
| 5 | Build typed tool registry, eliminate `any` | 45 min |
| 6 | Fix `SkillLoader` async init + DI context | 30 min |
| 7 | Add unit tests for managers and validators | 60 min |
| 8 | Run full lint + test + typecheck, fix issues | 20 min |

**Total: ~4.5 hours of focused work.**

---

## Risk Notes

- **Behavioral changes**: Moving from global singletons to DI means the entry point must construct and wire everything. The REPL logic stays the same, but imports change.
- **Anthropic SDK types**: Ensure `@anthropic-ai/sdk` types are used correctly; some older examples use `.mjs` paths that may not be needed.
- **SkillLoader timing**: Fixing the race condition is technically a bugfix, but it may change observed startup behavior (skills will actually be loaded before the first prompt).

---

## Success Criteria

- [ ] `npm run lint` passes with zero errors/warnings.
- [ ] `npm run test` passes with >80% coverage on managers and validators.
- [ ] `npx tsc --noEmit` passes.
- [ ] No `any` types in source code (except unavoidable third-party gaps).
- [ ] `s_full.ts` is <150 LOC and only bootstraps the REPL.
- [ ] All tool inputs are validated with Zod before hitting handlers.
