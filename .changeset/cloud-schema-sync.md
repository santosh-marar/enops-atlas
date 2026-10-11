---
"@enops/atlas-schema-intelligence": minor
"@enops/atlas-generators": minor
---

Schema sync tools, moved over from Enops Cloud.

- `@enops/atlas-schema-intelligence/node`: `checkRepositorySchemaTarget` and `describeSchemaTargetCheck` check that a patched repository now has exactly the approved schema; `extractForgeSchema` reads the schema of a saved file tree plus unsaved edits. Neither runs repository code.
- `@enops/atlas-schema-intelligence`: `schemaSynchronizationLosses` lists what a sync cannot keep exactly; `schemaSyncDirection`, `blocksSchemaSync`, `schemaChangeTask` and `SCHEMA_CHANGE_FORMATS` decide and describe a three-way sync; `assessAtlasProposal` rejects AI schema proposals that touch tables outside the plan; `chooseSchemaField` picks one side of a field conflict.
- `schemaChanges` now reports changes per field, and only flags removals, changed constraints and new required fields without a default for review.
- `drizzleToDbml` ignores runtime-only hooks (`$defaultFn`, `$onUpdate`, …), reads `default(sql\`...\`)`, keeps `text({ enum })` values as a note, and returns `applicationBehavior` (property names and hooks DBML cannot hold).
- The AI workflow sends schema, notes and project facts as marked data in the user message, never in the system prompt. `buildPlan` takes `technologyContext`; `generateDbmlFromPlan` takes `codeUsage`.
- `@enops/atlas-generators`: `generatePrismaConfig` writes a Prisma 7 `prisma.config.ts`.
