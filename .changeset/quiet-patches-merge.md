---
"@enops/atlas-schema-intelligence": patch
---

A change to an existing schema of four or more tables no longer rewrites the whole schema. `generateDbmlFromPlan` asks the model for only the tables it adds or changes, merges them into the current schema, and checks the result; if the merge does not parse or validate after a few tries it writes the whole schema as before. Renames, removals and small schemas are still written whole.
