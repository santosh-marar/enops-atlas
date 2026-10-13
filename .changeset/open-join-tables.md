---
"@enops/atlas-schema-intelligence": patch
---

Importing a Prisma schema no longer fails on an implicit many-to-many relation. It becomes the join table Prisma creates for it (`_<relation>` with columns `A` and `B`, the unique and secondary indexes, and cascading foreign keys to both models), with a warning saying so. Decimal and Float defaults such as `@default(0)` are also accepted: the default is read from the schema text, so every digit is kept.
