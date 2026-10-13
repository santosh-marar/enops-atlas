---
"@enops/atlas-schema": patch
"@enops/atlas-generators": patch
"@enops/atlas-schema-intelligence": patch
---

PostgreSQL array columns such as `text[]`, `integer[]`, `int[][]` and `varchar(40)[]` are supported. A column now resolves as its element type with a new `arrayDimensions` field, and keeps its native spelling. The SQL and Drizzle writers emit arrays exactly, defaults included. The Prisma writer emits a nullable one-dimensional array as a list (`String[]`, with `'{}'` as `@default([])`), and refuses a `NOT NULL` or multi-dimensional array with a clear reason, since Prisma creates list columns as nullable and has no nested lists. Database introspection keeps arrays instead of reading `text[]` as `text`.
