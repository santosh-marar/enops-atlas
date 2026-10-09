# `@enops/atlas-generators`

Deterministic code generators for Enops Atlas. Turn the canonical schema IR
into Postgres DDL, Prisma, Drizzle or seed SQL — and analyze migrations before
anyone runs them. No LLM guessing.

Part of the [enops-atlas](https://github.com/santosh-marar/enops-atlas) OSS
monorepo. Depends on [`@enops/atlas-schema`](https://www.npmjs.com/package/@enops/atlas-schema).

## Install

```sh
npm install @enops/atlas-generators
```

## Usage

```ts
import { normalize, parseDbml } from "@enops/atlas-schema";
import {
  analyzeMigrationSql,
  generateFromCanonical,
  renderSeedSql,
} from "@enops/atlas-generators";

const { schema } = normalize(parseDbml(source));

const sql = generateFromCanonical(schema, { format: "sql" });
if (sql.ok) console.log(sql.code);

const prisma = generateFromCanonical(schema, { format: "prisma" });
const drizzle = generateFromCanonical(schema, { format: "drizzle" });
const dbml = generateFromCanonical(schema, { format: "dbml" });

const seeds = renderSeedSql(schema, { dialect: "postgres" });

const analysis = analyzeMigrationSql(migrationSql);
if (analysis.destructive) console.log(analysis.findings);

```

## Main exports

| Export | Output |
| --- | --- |
| `generateFromCanonical` | discriminated result for `dbml \| sql \| prisma \| drizzle` |
| `generatePostgresSql` | Postgres DDL |
| `generatePrismaSchema` | `schema.prisma` |
| `generateDrizzleSchema` | Drizzle `pg-core` schema |
| `renderSeedSql` | `INSERT`s from DBML `records`, FK-topologically ordered, dialect-aware |
| `analyzeMigrationSql` | flags destructive statements (DROP/TRUNCATE/unqualified DELETE/type changes) |

Types: `CanonicalGeneration`, `MigrationAnalysis`, `DestructiveFinding`,
`SeedDialect`, `SeedSqlResult`.

Generators are pure: same canonical input, same output. Capability gating is
explicit — unsupported targets return diagnostics instead of partial code.

## Supported boundary

Requires Node.js >= 22 and canonical schema v2. DBML retains the source dialect. SQL, Prisma, and Drizzle writers currently target PostgreSQL; MySQL/SQLite or cross-dialect requests are rejected. Explicit junction tables are required for many-to-many relationships. Seed records use the separate seed exporter.

PostgreSQL DDL and Drizzle preserve named keys, forward/cyclic references, identities, enums, native types and precision, exact numeric defaults, checks, and supported index methods/expressions. Prisma 6 output includes both sides of relations, optionality, mapped names, composite keys, and database namespaces. Prisma exports reject checks, expression indexes, unsupported index methods, and tables without a non-null unique identity. Unknown native mappings return diagnostics; binary data is never converted into text. Direct writer functions throw for unsupported input; prefer `generateFromCanonical` when handling user input.

Migration analysis is a heuristic review aid, not authorization to apply a migration. Generated SQL is a schema artifact. Applying it is a separate caller-controlled operation. Consumer tests validate Prisma with its schema engine, compile and load Drizzle with TypeScript, and execute PostgreSQL DDL in an isolated database.

## Development

```sh
pnpm --filter @enops/atlas-generators test
pnpm --filter @enops/atlas-generators typecheck
pnpm --filter @enops/atlas-generators build
```

## License

MIT
