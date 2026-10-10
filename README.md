# enops-atlas

Enops Atlas is the MIT-licensed core Atlas product: database schema design, visualization, deterministic export, and reusable packages. It has no billing, subscriptions, cloud authentication, or hosted service dependency. Enops Cloud can consume its public packages.

## Layout

- `apps/web` — the enops Next.js app
- `packages/schema` — `@enops/atlas-schema`, schema model + DBML
- `packages/graph` — `@enops/atlas-graph`, schema graph + layout
- `packages/generators` — `@enops/atlas-generators`, SQL/Prisma/Drizzle codegen
- `packages/schema-intelligence` — `@enops/atlas-schema-intelligence`
- `packages/ui` — shared UI components (`@enops/atlas-ui`, shadcn/Biome monorepo setup)
- `packages/typescript-config` — shared TypeScript config bases

Publishable packages and the release process: [PUBLISHING.md](./PUBLISHING.md).

## Requirements

- Node.js >= 22
- pnpm 10 (`corepack enable`)
- Bun 1.3.13 for the test suite

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

## Production verification

The supported generation and introspection boundaries, regression coverage, and verification commands are documented in [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md). Unsupported dialects or schema features return diagnostics instead of guessed output.

The web app saves projects in IndexedDB in the current browser. Clearing browser data removes them; export schemas for backups. Optional AI requires your own API key. The browser sends that key to the configured AI gateway and sends your schema/prompt to the selected provider.
