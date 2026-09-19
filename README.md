# enops-atlas

Turborepo monorepo for enops — AI-powered database schema design, visualization, and export.

## Layout

- `apps/web` — the enops Next.js app
- `packages/typescript-config` — shared TypeScript config bases

## Requirements

- Node.js >= 20
- pnpm 10 (`corepack enable`)

## Commands

```bash
pnpm install        # install deps + set up git hooks (husky)
pnpm dev            # run all dev servers (apps/web on http://localhost:3000)
pnpm build          # build all packages/apps (turbo)
pnpm test           # run tests for all packages/apps
pnpm typecheck      # TypeScript checks
pnpm check          # ultracite (Biome) lint + format check, whole repo
pnpm fix            # ultracite (Biome) lint + format fix, whole repo
```

Run a command for one workspace with a filter, e.g.:

```bash
pnpm --filter web dev
pnpm --filter web test
```

## Git hooks

Hooks live at the repo root (`.husky/`) and apply to the whole monorepo:

- `pre-commit` — runs `lint-staged` (ultracite fix on staged files)
- `pre-push` — runs `pnpm check && pnpm typecheck`

## Linting & formatting

[Ultracite](https://ultracite.ai) (Biome) is the single linter/formatter for the
whole repo. Config: `biome.jsonc` at the repo root; IDE setup in `.vscode/`.
