# @enops/atlas-schema-intelligence

## 0.1.0-beta.2

### Minor Changes

- 070bdbf: Schema sync tools, moved over from Enops Cloud.
  
  - `@enops/atlas-schema-intelligence/node`: `checkRepositorySchemaTarget` and `describeSchemaTargetCheck` check that a patched repository now has exactly the approved schema; `extractForgeSchema` reads the schema of a saved file tree plus unsaved edits. Neither runs repository code.
  - `@enops/atlas-schema-intelligence`: `schemaSynchronizationLosses` lists what a sync cannot keep exactly; `schemaSyncDirection`, `blocksSchemaSync`, `schemaChangeTask` and `SCHEMA_CHANGE_FORMATS` decide and describe a three-way sync; `assessAtlasProposal` rejects AI schema proposals that touch tables outside the plan; `chooseSchemaField` picks one side of a field conflict.
  - `schemaChanges` now reports changes per field, and only flags removals, changed constraints and new required fields without a default for review.
  - `drizzleToDbml` ignores runtime-only hooks (`$defaultFn`, `$onUpdate`, …), reads `default(sql\`...\`)`, keeps `text({ enum })` values as a note, and returns `applicationBehavior` (property names and hooks DBML cannot hold).
  - The AI workflow sends schema, notes and project facts as marked data in the user message, never in the system prompt. `buildPlan` takes `technologyContext`; `generateDbmlFromPlan` takes `codeUsage`.
  - `@enops/atlas-generators`: `generatePrismaConfig` writes a Prisma 7 `prisma.config.ts`, and `generatePrismaSchema` no longer puts `url` in the datasource block (Prisma 7 rejects it). Breaking for Prisma 6 users: add `url = env("DATABASE_URL")` back to the datasource, or move to Prisma 7 with the generated `prisma.config.ts`.
- eb6daa5: A request about the whole schema's quality ("make it production ready", "get it to 100%", "follow best practices") is now handled directly. `resolveIntent` reads it as a modify and `resolveEntity` as the whole schema, both without a model. `buildPlan` takes the current schema in a new `existingDbml` option and plans straight from the schema's quality hints, so there is no planning call that can fail to parse. The plan carries a new `goal: "quality"`, and `generateDbmlFromPlan` writes it against a production-readiness checklist, scores the result, and runs up to two more passes while hints are left and each pass helps.

### Patch Changes

- b3a375e: The planner asks fewer questions. It asks only when the answer changes which tables are needed, otherwise it goes ahead and lists what it assumed. `buildPlan` takes a new `forcePlan` option that stops all questions, a low confidence score alone no longer triggers a vague question, and the plan schema accepts an empty table list or more than eight decisions instead of failing.
- 9365073: Importing a Prisma schema no longer fails on an implicit many-to-many relation. It becomes the join table Prisma creates for it (`_<relation>` with columns `A` and `B`, the unique and secondary indexes, and cascading foreign keys to both models), with a warning saying so. Decimal and Float defaults such as `@default(0)` are also accepted: the default is read from the schema text, so every digit is kept.
- b965a06: "Optimize performance", "make it faster" and "scale" requests are read as a change to the whole schema, and the plan carries a new `goal: "performance"` that adds a performance checklist (indexes, composite indexes, narrow types, partial indexes) to the writer. When the model's plan cannot be read even after asking again, `buildPlan` no longer throws if it was given the schema: the request goes ahead over the whole schema with the request as the instruction.
- 9bef450: A change to an existing schema of four or more tables no longer rewrites the whole schema. `generateDbmlFromPlan` asks the model for only the tables it adds or changes, merges them into the current schema, and checks the result; if the merge does not parse or validate after a few tries it writes the whole schema as before. Renames, removals and small schemas are still written whole.

## 0.1.0-beta.1

### Patch Changes

- 1afa78c: `@enops/atlas-schema-intelligence/node` no longer fails to load when `typescript` is not installed. TypeScript is loaded only when `drizzleToDbml` runs, and a clear error says to install it. Prisma import and everything else work without it.

## 0.1.0-beta.0

### Minor Changes

- cafb609: First public release. Require Node.js 22 or newer.
  
  - `@enops/atlas-schema`: DBML parser, canonical v2 schema that keeps native PostgreSQL types and index methods, DBML renderer, schema diff, SQL import and multi-dialect export.
  - `@enops/atlas-graph`: schema graph, neighbourhood traversal and exact change-impact analysis.
  - `@enops/atlas-generators`: deterministic PostgreSQL SQL, Prisma and Drizzle generators with capability diagnostics (no guessing), seed SQL and destructive-migration analysis.
  - `@enops/atlas-schema-intelligence`: schema validation and direction checks, search ranking, snapshots, quality hints, Prisma and Drizzle readers, bounded repository discovery, live PostgreSQL/MySQL introspection, and the AI plan, generate and validate workflow.

### Patch Changes

- Updated dependencies [cafb609]
  - @enops/atlas-schema@0.1.0-beta.0
  - @enops/atlas-graph@0.1.0-beta.0
