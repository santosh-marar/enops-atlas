# @enops/atlas-generators

## 0.1.0-beta.1

### Minor Changes

- 070bdbf: Schema sync tools, moved over from Enops Cloud.
  
  - `@enops/atlas-schema-intelligence/node`: `checkRepositorySchemaTarget` and `describeSchemaTargetCheck` check that a patched repository now has exactly the approved schema; `extractForgeSchema` reads the schema of a saved file tree plus unsaved edits. Neither runs repository code.
  - `@enops/atlas-schema-intelligence`: `schemaSynchronizationLosses` lists what a sync cannot keep exactly; `schemaSyncDirection`, `blocksSchemaSync`, `schemaChangeTask` and `SCHEMA_CHANGE_FORMATS` decide and describe a three-way sync; `assessAtlasProposal` rejects AI schema proposals that touch tables outside the plan; `chooseSchemaField` picks one side of a field conflict.
  - `schemaChanges` now reports changes per field, and only flags removals, changed constraints and new required fields without a default for review.
  - `drizzleToDbml` ignores runtime-only hooks (`$defaultFn`, `$onUpdate`, …), reads `default(sql\`...\`)`, keeps `text({ enum })` values as a note, and returns `applicationBehavior` (property names and hooks DBML cannot hold).
  - The AI workflow sends schema, notes and project facts as marked data in the user message, never in the system prompt. `buildPlan` takes `technologyContext`; `generateDbmlFromPlan` takes `codeUsage`.
  - `@enops/atlas-generators`: `generatePrismaConfig` writes a Prisma 7 `prisma.config.ts`, and `generatePrismaSchema` no longer puts `url` in the datasource block (Prisma 7 rejects it). Breaking for Prisma 6 users: add `url = env("DATABASE_URL")` back to the datasource, or move to Prisma 7 with the generated `prisma.config.ts`.

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
