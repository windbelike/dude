# dude

一个从 Claude Code 设计理念出发、用 TypeScript 手写的 **Harness Agent**（控制具智能体）。

> Prompt Engineering 解决「怎么问」。
> Context Engineering 解决「怎么记录」。
> Harness Engineering 解决「怎么管」。

我们不调用 SDK，直接用原生 HTTP 访问 Anthropic Messages API；不依赖黑盒框架，所有模块自己掌控。

### HTTP API 极简解读

我们的客户端只做一件事：`POST /v1/messages`。

**入参 (`CreateMessageRequest`)**：

- `model` —— 模型 ID，如 `claude-sonnet-4-6`
- `messages` —— 对话历史，每条消息含 `role` (user/assistant) 和 `content`。`content` 可以是纯文本，也可以是结构化数组（`text` / `tool_use` / `tool_result` 三种 block），这让工具调用的往返数据可以完整嵌入对话流
- `max_tokens` —— 模型本次最多输出多少 token
- `system` —— 系统提示，控制模型的行为基调
- `tools` —— 可选的工具列表，每个工具定义 `name`、`description` 和 `input_schema`（JSON Schema）。模型根据描述自行判断何时调用

**出参 (`MessageResponse`)**：

- `content` —— 模型返回的 block 数组，可能是 `text`（直接回答）或 `tool_use`（要求执行工具）
- `stop_reason` —— 停止原因。`tool_use` 表示模型想要调用工具，此时我们执行后把结果以 `tool_result` block 塞回 `messages`，再次请求；`end_turn` 表示模型认为任务完成，本轮结束
- `usage` —— 本次请求的 input/output token 数，用于监控成本

这就是全部。没有 SDK 的层层封装，请求和响应的结构一眼看穿。

## 为什么叫 dude？

dude 不是 Assistant、Copilot 那种 corporate 产品名，而是你在 Slack 里 @ 的朋友 —— casual、对等、随叫随到。四个字母，短小好打，也符合这个项目「去掉一切多余包装」的极简哲学。

---

## 什么是 Harness Agent？

普通脚本只能「一问一答」，而 Harness Agent 是一个**持续运行的控制具**：

1. **多轮工具循环** —— 模型不只在回答你，而是在调用 `bash`、`read_file`、`write_file`、`edit_file` 等工具主动完成任务。
2. **任务管理** —— 复杂需求拆分为 `task`，支持依赖关系、认领、状态流转。
3. **子代理委派** —— 用 `task` 工具 spawn 临时子代理（Explore / general-purpose）做隔离探索。
4. **队友系统** —— 用 `spawn_teammate` 启动常驻队友，它们会在 idle 时自动 poll 并认领未分配任务。
5. **上下文压缩** —— 对话 token 超过阈值时自动总结归档，防止爆上下文。
6. **后台执行** —— 耗时命令丢进 `background_run`，结果在下一轮自动注入对话。

---

## 快速开始

```sh
npm install
cp .env.example .env   # 填入 ANTHROPIC_API_KEY

npm run dev     # 启动完整 Harness
```

---

## 架构拆解（开发者视角）

### 1. `src/core/` —— 心脏

#### `agent-loop.ts`

Agent 的核心是一个**无限循环**（while true），每轮做这些事：

```
1. microcompact()      —— 清理老旧 tool_result，腾出 token
2. 检查 token 阈值     —— 超过则 autoCompact() 总结对话历史
3. drain background    —— 把已完成的 bg 任务结果注入 messages
4. drain inbox         —— 把队友发来的消息注入 messages
5. createMessage()     —— 调用模型
6. stop_reason != tool_use ? 结束本轮 : 继续
7. dispatchTool()      —— 并行/串行执行模型请求的工具
8. 把 tool_result 回传模型，进入下一轮
```

还有一个**防遗忘机制**：如果模型连续 3 轮没更新 Todo，会自动插入 `<reminder>Update your todos.</reminder>`。

#### `system-prompt.ts`

构造系统提示。除了基本信息外，会把 `skills/` 目录下所有 SKILL.md 的摘要注入，让模型知道有哪些专家技能可加载。

---

### 2. `src/lib/` —— 基础设施

#### `client.ts`

**零依赖的 Anthropic HTTP 客户端**。直接 `fetch` 到 `https://api.anthropic.com/v1/messages`，不引入 `@anthropic-ai/sdk`：

- 自己定义 `MessageParam`、`Tool`、`MessageResponse` 等类型（`src/types/anthropic.ts`）
- 支持 `ANTHROPIC_BASE_URL` 覆盖，方便换 endpoint
- 出错时把 response body 抛出来，方便调试

#### `config.ts`

所有魔数集中管理：

| 常量 | 含义 |
|------|------|
| `TOKEN_THRESHOLD` | 自动压缩触发阈值（100k tokens） |
| `AGENT_LOOP_MAX_ROUNDS` | 单轮用户输入最多允许 50 轮工具调用 |
| `IDLE_TIMEOUT_SECONDS` | 队友 idle 超时后自动 shutdown |
| `BASH_TIMEOUT_MS` | bash 工具超时 120 秒 |

#### `tools.ts`

底层工具实现：

- `runBash` —— `child_process.spawn`，支持超时、stdout/stderr 合并、截断
- `runRead` —— 带 `limit` 参数的安全文件读取
- `runWrite` / `runEdit` —— 写文件与精确文本替换（编辑前会校验 old_text 存在性）

---

### 3. `src/managers/` —— 管理器层

每个 manager 负责一个独立的持久化领域，全部基于文件系统（JSON / JSONL），无数据库依赖。

#### `TodoManager`

内存中的轻量 checklist。模型通过 `TodoWrite` 工具增删改 todo 项。适合短周期、当前会话内的任务追踪。

#### `TaskManager`

持久化到 `.tasks/task_${id}.json` 的**任务看板**：

- `task_create` / `task_get` / `task_update` / `task_list`
- 支持 `blockedBy` 依赖链
- 支持 `claim_task` 认领（解决多队友竞争）
- 适合跨会话、跨 agent 的正式任务分配

#### `BackgroundManager`

把 `background_run` 的 command 丢进 `child_process.spawn`，返回 `task_id`。主循环通过 `drain()` 收割已完成任务的结果，以 `<background-results>` 标签注入对话。

#### `MessageBus`

队友间通信的基础设施。基于文件系统队列：

- `send(from, to, content)` —— 写入 `.team/inbox/${to}.jsonl`
- `readInbox(who)` —— 读取并清空收件箱
- `broadcast()` —— 批量群发

所有消息带 `timestamp` 和 `type`（message / broadcast / shutdown_request / ...）。

#### `SkillLoader`

运行时加载 `skills/${name}/SKILL.md` 的异步工厂。解决构造函数里不能 `await` 的问题：

```ts
const skills = await SkillLoader.load(SKILLS_DIR);
```

每个 skill 是一个 Markdown 文件，模型通过 `load_skill` 工具读取内容，获得领域专家知识。

#### `TeammateManager`

常驻队友的生命周期管理：

- `spawn(name, role, prompt)` —— 启动一个独立循环
- 队友有自己的 `MessageBus` 收件箱，主循环会把 inbox 消息注入其对话历史
- **Work Phase**：最多 50 轮工具调用，做完后调用 `idle` 工具
- **Idle Phase**：每 5 秒 poll 一次 inbox + 扫描未认领 task；有新消息或新任务则回到 Work Phase；60 秒无事则 shutdown

---

### 4. `src/services/` —— 服务层

#### `tool-registry.ts`

**工具注册表**。用 `mkTool()` 工厂统一封装每个工具的：

- `name` / `description` —— 模型可见的元数据
- `schema` —— Zod 运行时校验
- `inputSchema` —— JSON Schema（供模型做 function calling）
- `handler` —— 实际执行逻辑

所有工具共享 `AgentContext`（DI 容器），包含 `todo`、`taskMgr`、`bg`、`bus`、`team`、`skills`，避免全局单例。

#### `compression.ts`

上下文压缩策略：

- `microcompact` —— 轻量清理：把历史 tool_result 内容替换成 `[cleared]`，只保留最近 3 个完整结果
- `autoCompact` —— 重度压缩：把整段对话发给模型做总结，生成 `[Compressed. Transcript: ...]` 的浓缩消息，并重置对话历史

#### `subagent.ts`

`task` 工具的底层实现。spawn 一个临时子代理：

- `Explore` 类型：只给 `bash` + `read_file`，用于代码探索、搜索
- `general-purpose` 类型：额外给 `write_file` + `edit_file`，可用于独立编码任务

有独立的轮数上限（`SUBAGENT_MAX_ROUNDS = 30`），结束后把结果文本回传给主代理。

---

### 5. `src/types/` —— 类型定义

- `anthropic.ts` —— 镜像 Anthropic API 的数据结构：`MessageParam`、`Tool`、`ToolUseBlock`、`MessageResponse`...
- `index.ts` —— 业务领域类型：`Task`、`TodoItem`、`Teammate`、`Message`、`Skill`...

---

### 6. `src/validators/` —— 运行时校验

所有工具输入用 **Zod** 定义 schema，在 `tool-registry.ts` 的 `dispatchTool()` 里统一 `safeParse`。模型幻觉参数时，直接返回 `Error: Invalid input for ${tool}`，不让脏数据流入业务逻辑。

---

## 数据流全景

```
用户输入
    │
    ▼
┌─────────────┐
│ agent-loop  │ ◄── 无限循环
└──────┬──────┘
       │ createMessage()
       ▼
┌─────────────┐
│  Anthropic  │
│   API       │
└──────┬──────┘
       │ tool_use
       ▼
┌─────────────┐
│ dispatchTool│
└──────┬──────┘
       ├─────► bash / read / write / edit
       ├─────► TodoWrite ──► TodoManager
       ├─────► task_create/update ──► TaskManager
       ├─────► background_run ──► BackgroundManager
       ├─────► send_message ──► MessageBus
       ├─────► spawn_teammate ──► TeammateManager
       └─────► task (subagent) ──► subagent.ts
       │
       ▼
  tool_result  ──► 回到 agent-loop ──► 继续循环
```

---

## 如何扩展

### 增加一个新工具

1. 在 `src/validators/tools.ts` 定义 Zod schema：
   ```ts
   export const MyToolInput = z.object({ foo: z.string() });
   ```

2. 在 `src/services/tool-registry.ts` 注册：
   ```ts
   mkTool(
     "my_tool",
     "Do something awesome.",
     MyToolInput,
     { type: "object", properties: { foo: { type: "string" } }, required: ["foo"] },
     (input, ctx) => { /* ... */ }
   )
   ```

3. 运行 `npm run typecheck && npm test` 验证。

### 增加一个新 Manager

1. 在 `src/managers/` 新建 class，实现 `init()` / `persist()`（如需要）。
2. 把实例注入 `AgentContext` 接口（`src/services/tool-registry.ts`）。
3. 在 `harnessAgent.ts` 的 `main()` 里初始化并传入 `ctx`。

---

## License

MIT
