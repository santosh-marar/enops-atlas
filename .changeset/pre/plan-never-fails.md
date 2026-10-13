---
"@enops/atlas-schema-intelligence": patch
---

"Optimize performance", "make it faster" and "scale" requests are read as a change to the whole schema, and the plan carries a new `goal: "performance"` that adds a performance checklist (indexes, composite indexes, narrow types, partial indexes) to the writer. When the model's plan cannot be read even after asking again, `buildPlan` no longer throws if it was given the schema: the request goes ahead over the whole schema with the request as the instruction.
