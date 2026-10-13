---
"@enops/atlas-schema-intelligence": patch
---

The planner asks fewer questions. It asks only when the answer changes which tables are needed, otherwise it goes ahead and lists what it assumed. `buildPlan` takes a new `forcePlan` option that stops all questions, a low confidence score alone no longer triggers a vague question, and the plan schema accepts an empty table list or more than eight decisions instead of failing.
