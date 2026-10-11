import type { TableSchema } from "@enops/atlas-schema";
import {
  normalize,
  parseDbml,
  sha256Hex,
  sortedSet,
  stableValue,
} from "@enops/atlas-schema";
export const SCHEMA_SNAPSHOT_VERSION = 2;

/** Versioned, JSON-safe interchange envelope. DBML remains the editable source.
 * The full physical projection accompanies the existing generation model so
 * unsupported native types/checks are retained and never silently erased.
 */
export function schemaSnapshot(dbml: string) {
  const parsed = parseDbml(dbml);
  const canonical = normalize(parsed);
  const tables = [...parsed.tables.values()].map((table) => ({
    ...table,
    checks: sortObjects(table.checks),
    columns: sortObjects(
      table.columns.map((column) => ({
        ...column,
        checks: sortObjects(column.checks),
        nullable: column.primaryKey ? false : column.nullable,
      }))
    ),
    indexes: sortObjects(table.indexes),
  }));
  const physical = {
    enums: sortObjects([...parsed.enums.values()]),
    relationships: sortObjects(parsed.relationships),
    tables: sortObjects(tables),
  };
  return {
    canonical: canonical.schema,
    digest: sha256Hex(
      stableJson({
        dialect: parsed.dialect ?? "unknown",
        physical,
        version: SCHEMA_SNAPSHOT_VERSION,
      })
    ),
    losses: canonical.errors,
    physical,
    version: SCHEMA_SNAPSHOT_VERSION,
  };
}

export function stableJson(value: unknown): string {
  return stableValue(value);
}

function sortObjects<T>(items: T[]): T[] {
  return sortedSet(items);
}

export function schemaChanges(beforeDbml: string, afterDbml: string) {
  const before = schemaSnapshot(beforeDbml);
  const after = schemaSnapshot(afterDbml);
  const changes: Array<{
    object: string;
    change: "added" | "removed" | "modified";
    reviewRequired: boolean;
  }> = [];
  if (before.canonical.dialect !== after.canonical.dialect)
    changes.push({
      change: "modified",
      object: "database dialect",
      reviewRequired: true,
    });
  function compare(
    kind: string,
    left: Map<string, unknown>,
    right: Map<string, unknown>
  ) {
    for (const [key, value] of left) {
      if (!right.has(key))
        changes.push({
          change: "removed",
          object: `${kind} ${key}`,
          reviewRequired: true,
        });
      else if (stableJson(value) !== stableJson(right.get(key)))
        changes.push({
          change: "modified",
          object: `${kind} ${key}`,
          reviewRequired: true,
        });
    }
    for (const key of right.keys())
      if (!left.has(key))
        changes.push({
          change: "added",
          object: `${kind} ${key}`,
          reviewRequired: false,
        });
  }
  const tableMap = (tables: TableSchema[]) =>
    new Map(tables.map((t) => [t.fullName, t]));
  const leftTables = tableMap(before.physical.tables);
  const rightTables = tableMap(after.physical.tables);
  for (const [name, table] of leftTables) {
    const next = rightTables.get(name);
    if (!next) {
      changes.push({
        change: "removed",
        object: `table ${name}`,
        reviewRequired: true,
      });
      continue;
    }
    compare(
      `field ${name}`,
      new Map(table.columns.map((column) => [column.name, column])),
      new Map(next.columns.map((column) => [column.name, column]))
    );
    const { columns: _before, ...beforeProperties } = table;
    const { columns: _after, ...afterProperties } = next;
    if (stableJson(beforeProperties) !== stableJson(afterProperties))
      changes.push({
        change: "modified",
        object: `constraints/metadata ${name}`,
        reviewRequired: true,
      });
    for (const column of next.columns) {
      if (
        !(
          table.columns.some((old) => old.name === column.name) ||
          column.nullable ||
          column.default
        )
      )
        changes.push({
          change: "added",
          object: `required field ${name}.${column.name} without a default`,
          reviewRequired: true,
        });
    }
  }
  for (const name of rightTables.keys())
    if (!leftTables.has(name))
      changes.push({
        change: "added",
        object: `table ${name}`,
        reviewRequired: false,
      });
  compare(
    "enum",
    new Map(before.physical.enums.map((e) => [`${e.schema}.${e.name}`, e])),
    new Map(after.physical.enums.map((e) => [`${e.schema}.${e.name}`, e]))
  );
  if (
    stableJson(before.physical.relationships) !==
    stableJson(after.physical.relationships)
  )
    changes.push({
      change: "modified",
      object: "foreign keys",
      reviewRequired: true,
    });
  return {
    afterDigest: after.digest,
    beforeDigest: before.digest,
    changes,
    isEmpty: before.digest === after.digest,
  };
}

/** Sync compares the full physical schema, not the generator's reduced type set.
 * PostgreSQL scalar arrays retain their exact native type in that projection.
 * Keep the generator's errors intact and reject every other unsupported type.
 */
export function schemaSynchronizationLosses(
  snapshot: ReturnType<typeof schemaSnapshot>
) {
  return snapshot.losses.filter((loss) => {
    if (loss.code !== "UNSUPPORTED_TYPE") return true;
    const column = snapshot.physical.tables
      .find((table) => table.fullName === loss.table)
      ?.columns.find((column) => column.name === loss.column);
    return !(
      column &&
      /^(text|uuid|integer|int|int4|int8|bigint|smallint|boolean|bool|json|jsonb|date|timestamp|timestamptz|real|float|numeric|decimal|varchar)(\[\])+$/i.test(
        column.type
      )
    );
  });
}
