# @enops/atlas-schema-intelligence

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
