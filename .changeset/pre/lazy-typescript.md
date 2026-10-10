---
"@enops/atlas-schema-intelligence": patch
---

`@enops/atlas-schema-intelligence/node` no longer fails to load when `typescript` is not installed. TypeScript is loaded only when `drizzleToDbml` runs, and a clear error says to install it. Prisma import and everything else work without it.
