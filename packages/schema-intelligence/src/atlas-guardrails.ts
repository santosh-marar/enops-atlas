import type { TaskPlan } from "./ai-workflow/types";
import { schemaChanges, schemaSnapshot, stableJson } from "./schema-snapshot";

/** Enforce scope against physical definitions, including details canonical types omit. */
export function assessAtlasProposal(
  beforeDbml: string,
  afterDbml: string,
  plan: TaskPlan
) {
  if (afterDbml.length > 200_000)
    throw new Error("Atlas proposal exceeds the schema size limit");
  if (afterDbml.includes("[REDACTED:secret]"))
    throw new Error("Atlas cannot write redacted credentials into a schema");
  if (
    !["generate", "modify", "add", "remove", "rename"].includes(
      plan.operationType
    )
  )
    throw new Error("This Atlas operation is read-only or unsupported");
  const before = schemaSnapshot(beforeDbml),
    after = schemaSnapshot(afterDbml);
  if (before.losses.length || after.losses.length)
    throw new Error(
      "Atlas cannot safely represent this schema; use the manual editor"
    );
  if (
    before.physical.tables.length &&
    before.canonical.dialect !== after.canonical.dialect
  )
    throw new Error("Atlas cannot change the database dialect through chat");
  const tables = [...before.physical.tables, ...after.physical.tables];
  const allowed = new Set<string>();
  for (const entry of plan.tables) {
    const matches = [
      ...new Set(
        tables
          .filter((t) => t.fullName === entry.name || t.name === entry.name)
          .map((t) => t.fullName)
      ),
    ];
    if (matches.length > 1 && !entry.name.includes("."))
      throw new Error(
        `Table ${entry.name} is ambiguous; use its schema-qualified name`
      );
    for (const name of matches) allowed.add(name);
  }
  const left = new Map(before.physical.tables.map((t) => [t.fullName, t]));
  const right = new Map(after.physical.tables.map((t) => [t.fullName, t]));
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    if (
      stableJson(left.get(name)) !== stableJson(right.get(name)) &&
      !allowed.has(name)
    )
      throw new Error(
        `Atlas changed ${name} outside the planned tables; no schema was applied`
      );
  }
  const oldRelations = new Map(
    before.physical.relationships.map((r) => [stableJson(r), r])
  );
  const newRelations = new Map(
    after.physical.relationships.map((r) => [stableJson(r), r])
  );
  for (const key of new Set([...oldRelations.keys(), ...newRelations.keys()])) {
    if (oldRelations.has(key) && newRelations.has(key)) continue;
    const relation = oldRelations.get(key) ?? newRelations.get(key)!;
    if (!allowed.has(`${relation.from.schema}.${relation.from.table}`))
      throw new Error(
        "Atlas changed a relationship outside the planned tables; no schema was applied"
      );
  }
  // A global enum edit may affect tables not named in the plan.
  const oldEnums = new Map(
    before.physical.enums.map((e) => [`${e.schema}.${e.name}`, e])
  );
  const newEnums = new Map(
    after.physical.enums.map((e) => [`${e.schema}.${e.name}`, e])
  );
  for (const key of new Set([...oldEnums.keys(), ...newEnums.keys()])) {
    if (stableJson(oldEnums.get(key)) === stableJson(newEnums.get(key)))
      continue;
    const name = key.split(".").at(-1)!;
    const users = tables.filter((t) =>
      t.columns.some((c) => c.type === key || c.type === name)
    );
    if (!users.length || users.some((t) => !allowed.has(t.fullName)))
      throw new Error(`Atlas changed enum ${key} outside the plan`);
  }
  const changes = schemaChanges(beforeDbml, afterDbml);
  return {
    changes: changes.changes,
    digest: after.digest,
    risks: changes.changes
      .filter((change) => change.reviewRequired)
      .map((change) => `${change.change}: ${change.object}`),
  };
}
