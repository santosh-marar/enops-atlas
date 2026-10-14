---
"@enops/atlas-schema-intelligence": patch
---

The "foreign key has no index" quality hint names the referenced table instead of `[object Object]`, and no longer flags a foreign key column that is unique, since a unique constraint is already backed by an index.
