---
"@enops/atlas-schema-intelligence": minor
---

A request about the whole schema's quality ("make it production ready", "get it to 100%", "follow best practices") is now handled directly. `resolveIntent` reads it as a modify and `resolveEntity` as the whole schema, both without a model. `buildPlan` takes the current schema in a new `existingDbml` option and plans straight from the schema's quality hints, so there is no planning call that can fail to parse. The plan carries a new `goal: "quality"`, and `generateDbmlFromPlan` writes it against a production-readiness checklist, scores the result, and runs up to two more passes while hints are left and each pass helps.
