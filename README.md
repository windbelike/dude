# dude

一个从 Claude Code 设计理念出发、用 TypeScript 手写的 Harness Agent（控制具智能体）。

## 为什么叫 dude？

dude 不是 Assistant、Copilot 那种 corporate 产品名，而是你在 Slack 里 @ 的朋友 —— casual、对等、随叫随到。四个字母，短小好打，也符合这个项目「去掉一切多余包装」的极简哲学。

## 快速开始

```sh
npm install
cp .env.example .env   # 填入 ANTHROPIC_API_KEY

npm run dev     # 启动完整 Harness
```

## 什么是 Harness Agent？

> Prompt Engineering 解决「怎么问」。
> Context Engineering 解决「怎么记录」。
> Harness Engineering 解决「怎么管」。

普通脚本只能「一问一答」，而 Harness Agent 是一个**持续运行的控制具**。它不调用 SDK，直接用原生 HTTP 访问 Anthropic Messages API，所有模块自己掌控。

核心能力：

1. **多轮工具循环** —— 模型不只在回答你，而是在调用 `bash`、`read_file`、`write_file`、`edit_file` 等工具主动完成任务。
2. **任务管理** —— 复杂需求拆分为 `task`，支持依赖关系、认领、状态流转。
3. **子代理委派** —— 用 `task` 工具 spawn 临时子代理（Explore / general-purpose）做隔离探索。
4. **队友系统** —— 用 `spawn_teammate` 启动常驻队友，它们会在 idle 时自动 poll 并认领未分配任务。
5. **上下文压缩** —— 对话 token 超过阈值时自动总结归档，防止爆上下文。
6. **后台执行** —— 耗时命令丢进 `background_run`，结果在下一轮自动注入对话。

## 架构拆解

### 核心循环（`src/core/`）

#### `agent-loop.ts`

Agent 的核心是一个**无限循环**（while true），每轮做这些事：

```
1. microcompact()      —— 清理老旧 tool_result，腾出 token
2. 检查 token 阈值     —— 超过则 autoCompact() 总结对话历史
3. drain background    —— 把已完成的 bg 任务结果注入 messages
4. drain inbox         —— 把队友发来的消息注入 messages
5. createMessage()     —— 调用模型
6. stop_reason != tool_use ? 结束本轮 : 继续
7. dispatchTool()      —— 执行模型请求的工具
8. 把 tool_result 回传模型，进入下一轮
```

还有一个**防遗忘机制**：如果模型连续 3 轮没更新 Todo，会自动插入 `<reminder>Update your todos.</reminder>`。

#### `system-prompt.ts`

构造系统提示。除了基本信息外，会把 `skills/` 目录下所有 SKILL.md 的摘要注入，让模型知道有哪些专家技能可加载。

### 基础设施（`src/lib/` + `src/types/anthropic.ts`）

#### `client.ts` —— HTTP 客户端

**零依赖**。不引入 `@anthropic-ai/sdk`，自己用原生 `fetch` 发送 `POST /v1/messages`，自己定义类型，支持 `ANTHROPIC_BASE_URL` 覆盖，出错时把 response body 直接抛出来。

这就是入参和出参的全部结构：

**入参 (`CreateMessageRequest`)**：

- `model` —— 模型 ID
- `messages` —— 对话历史，每条消息含 `role` (user/assistant) 和 `content`。`content` 可以是纯文本，也可以是结构化数组（`text` / `tool_use` / `tool_result` 三种 block），工具调用的往返数据由此完整嵌入对话流
- `max_tokens` —— 本次最大输出 token 数
- `system` —— 系统提示，控制行为基调
- `tools` —— 可选工具列表，每个工具含 `name`、`description`、`input_schema`（JSON Schema），模型自行判断何时调用

**出参 (`MessageResponse`)**：

- `content` —— block 数组，可能是 `text`（直接回答）或 `tool_use`（要求执行工具）
- `stop_reason` —— `tool_use` 表示模型要调用工具，我们把结果以 `tool_result` block 塞回 `messages` 再请求；`end_turn` 表示本轮结束
- `usage` —— input/output token 数，用于成本监控

没有 SDK 的层层封装，一眼看穿。

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

### 工具与扩展（`src/services/` + `src/validators/`）

#### `tool-registry.ts`

**工具注册表**。用 `mkTool()` 工厂统一封装每个工具的 `name`、`description`、`schema`（Zod 校验）、`inputSchema`（JSON Schema 供模型用）、`handler`（实际逻辑）。

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

#### `src/validators/`

所有工具输入用 **Zod** 定义 schema，在 `dispatchTool()` 里统一 `safeParse`。模型幻觉参数时，直接返回 `Error: Invalid input for ${tool}`，不让脏数据流入业务逻辑。

### 状态与协作（`src/managers/`）

每个 manager 负责一个独立的持久化领域，全部基于文件系统（JSON / JSONL），无数据库依赖。

| Manager | 职责 |
|---------|------|
| `TodoManager` | 内存 checklist，当前会话内的短周期任务追踪 |
| `TaskManager` | 持久化任务看板（`.tasks/`），支持依赖链与认领 |
| `BackgroundManager` | 把命令丢进后台 spawn，主循环通过 `drain()` 收割结果 |
| `MessageBus` | 队友间通信，基于文件系统队列（`.team/inbox/`） |
| `SkillLoader` | 异步加载 `skills/${name}/SKILL.md`，给模型注入领域知识 |
| `TeammateManager` | 队友生命周期：spawn → Work Phase（50 轮工具调用）→ Idle Phase（poll inbox + 扫描 task）→ shutdown |

### 数据流全景

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

## License

MIT
