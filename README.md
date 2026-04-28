# dude

Harness Engineering for Real Agents.

## Quick Start

```sh
npm install
cp .env.example .env   # Edit .env with your ANTHROPIC_API_KEY

npm run dev     # Full harness session
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the full harness agent |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run tests |
| `npm run lint` | Lint and format check |
| `npm run typecheck` | Type-check only |

## Structure

```
src/
  agents/      # Agent loop implementations
  core/        # Agent loop and system prompt
  lib/         # Shared utilities and config
  managers/    # Todo, Task, Background, MessageBus, Skills, Teammates
  services/    # Tool registry, compression, subagents
  types/       # Domain types
  validators/  # Zod schemas for tool inputs
```

## License

MIT
