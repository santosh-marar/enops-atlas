// canonical/diff.ts
//
// Deterministic diff between two CanonicalSchema states -- e.g. before
// and after an edit, or two versions in history. No LLM involved; this
// is a pure structural comparison, same principle as everything else
// in this pipeline: compute the facts, let an LLM only explain them
// if/when that's needed separately.

import { sortedSet, stableValue } from "./compare";
import type {
  CanonicalColumn,
  CanonicalEnum,
  CanonicalForeignKey,
  CanonicalSchema,
  CanonicalTable,
} from "./types";

export interface ColumnDiff {
  after: CanonicalColumn;
  before: CanonicalColumn;
  /** Which fields actually differ -- e.g. ["type", "nullable"] -- so a caller doesn't have to re-diff the objects itself. */
  changedFields: string[];
  name: string;
}

export interface TableDiff {
  addedColumns: CanonicalColumn[];
  addedForeignKeys: CanonicalForeignKey[];
  checksChanged: boolean;
  indexesChanged: boolean;
  metadataChanged: boolean;
  modifiedColumns: ColumnDiff[];
  primaryKeyChanged: boolean;
  removedColumns: CanonicalColumn[];
  removedForeignKeys: CanonicalForeignKey[];
  tableKey: string; // "schema.table"
  uniqueConstraintsChanged: boolean;
}

export interface SchemaDiff {
  addedEnums: CanonicalEnum[];
  addedTables: CanonicalTable[];
  dialectChanged: boolean;
  /** True if nothing changed at all -- convenience so callers don't have to check every array. */
  isEmpty: boolean;
  /** Same enum name, different values -- e.g. a value added or removed from an existing enum. */
  modifiedEnums: {
    name: string;
    schema: string;
    before: string[];
    after: string[];
  }[];
  modifiedTables: TableDiff[];
  removedEnums: CanonicalEnum[];
  removedTables: CanonicalTable[];
  /**
   * Every tableKey touched in any way (added, removed, or modified).
   * This is the set to check scope against -- see checkDiffScope().
   * Motivating case: AI generation/refinement emits full DBML text,
   * not scoped structured edits, so nothing structurally prevents a
   * "add a column to users" request from also silently rewriting an
   * unrelated table. Diffing old vs new and checking touchedTables
   * against what was actually expected is the guardrail that catches it.
   */
  touchedTables: Set<string>;
}

function key(schema: string, table: string): string {
  // Display keys remain compatible. Parsers reject ambiguous dotted pairs;
  // internal FK identity uses structured serialization rather than joins.
  return `${schema}.${table}`;
}

function diffColumn(
  before: CanonicalColumn,
  after: CanonicalColumn
): ColumnDiff | null {
  const fields = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ] as (keyof CanonicalColumn)[];
  const changed = fields.filter(
    (f) =>
      stableValue(
        f === "checks" ? sortedSet(before.checks ?? []) : before[f]
      ) !==
      stableValue(f === "checks" ? sortedSet(after.checks ?? []) : after[f])
  );
  if (changed.length === 0) return null;
  return { after, before, changedFields: changed, name: before.name };
}

function fkIdentity(fk: CanonicalForeignKey): string {
  // Actions, cardinality and names are part of the physical constraint too.
  return stableValue(fk);
}

function diffTable(
  before: CanonicalTable,
  after: CanonicalTable
): TableDiff | null {
  const beforeCols = new Map(before.columns.map((c) => [c.name, c]));
  const afterCols = new Map(after.columns.map((c) => [c.name, c]));

  const addedColumns = after.columns.filter((c) => !beforeCols.has(c.name));
  const removedColumns = before.columns.filter((c) => !afterCols.has(c.name));
  const modifiedColumns: ColumnDiff[] = [];
  for (const [name, beforeCol] of beforeCols) {
    const afterCol = afterCols.get(name);
    if (!afterCol) continue;
    const d = diffColumn(beforeCol, afterCol);
    if (d) modifiedColumns.push(d);
  }

  const beforeFks = new Map(
    before.foreignKeys.map((fk) => [fkIdentity(fk), fk])
  );
  const afterFks = new Map(after.foreignKeys.map((fk) => [fkIdentity(fk), fk]));
  const addedForeignKeys = after.foreignKeys.filter(
    (fk) => !beforeFks.has(fkIdentity(fk))
  );
  const removedForeignKeys = before.foreignKeys.filter(
    (fk) => !afterFks.has(fkIdentity(fk))
  );

  const primaryKeyChanged =
    JSON.stringify(before.primaryKey ?? null) !==
    JSON.stringify(after.primaryKey ?? null);
  const indexesChanged =
    stableValue(sortedSet(before.indexes)) !==
    stableValue(sortedSet(after.indexes));
  const uniqueConstraintsChanged =
    stableValue(sortedSet(before.uniqueConstraints)) !==
    stableValue(sortedSet(after.uniqueConstraints));
  const checksChanged =
    stableValue(sortedSet(before.checks ?? [])) !==
    stableValue(sortedSet(after.checks ?? []));
  const metadataChanged =
    stableValue([before.note, before.records]) !==
    stableValue([after.note, after.records]);

  const hasChanges =
    addedColumns.length > 0 ||
    removedColumns.length > 0 ||
    modifiedColumns.length > 0 ||
    addedForeignKeys.length > 0 ||
    removedForeignKeys.length > 0 ||
    primaryKeyChanged ||
    indexesChanged ||
    uniqueConstraintsChanged ||
    checksChanged ||
    metadataChanged;

  if (!hasChanges) return null;

  return {
    addedColumns,
    addedForeignKeys,
    checksChanged,
    indexesChanged,
    metadataChanged,
    modifiedColumns,
    primaryKeyChanged,
    removedColumns,
    removedForeignKeys,
    tableKey: key(after.schema, after.name),
    uniqueConstraintsChanged,
  };
}

/**
 * Computes an exact, deterministic diff between two CanonicalSchema
 * states. Tables/enums are matched by schema-qualified identity, so a
 * rename shows up as a remove + add (renaming isn't detected as a
 * distinct operation -- there's no reliable signal to distinguish
 * "renamed" from "removed one, added an unrelated one" from structure
 * alone).
 */
export function diffSchemas(
  before: CanonicalSchema,
  after: CanonicalSchema
): SchemaDiff {
  const dialectChanged =
    stableValue([before.version, before.dialect, before.databaseType]) !==
    stableValue([after.version, after.dialect, after.databaseType]);
  const beforeTables = new Map(
    before.tables.map((t) => [key(t.schema, t.name), t])
  );
  const afterTables = new Map(
    after.tables.map((t) => [key(t.schema, t.name), t])
  );

  const addedTables = after.tables.filter(
    (t) => !beforeTables.has(key(t.schema, t.name))
  );
  const removedTables = before.tables.filter(
    (t) => !afterTables.has(key(t.schema, t.name))
  );

  const modifiedTables: TableDiff[] = [];
  for (const [k, beforeTable] of beforeTables) {
    const afterTable = afterTables.get(k);
    if (!afterTable) continue;
    const d = diffTable(beforeTable, afterTable);
    if (d) modifiedTables.push(d);
  }

  const beforeEnums = new Map(
    before.enums.map((e) => [key(e.schema, e.name), e])
  );
  const afterEnums = new Map(
    after.enums.map((e) => [key(e.schema, e.name), e])
  );
  const addedEnums = after.enums.filter(
    (e) => !beforeEnums.has(key(e.schema, e.name))
  );
  const removedEnums = before.enums.filter(
    (e) => !afterEnums.has(key(e.schema, e.name))
  );

  const modifiedEnums: SchemaDiff["modifiedEnums"] = [];
  for (const [k, beforeEnum] of beforeEnums) {
    const afterEnum = afterEnums.get(k);
    if (!afterEnum) continue;
    if (stableValue(beforeEnum) !== stableValue(afterEnum)) {
      modifiedEnums.push({
        after: afterEnum.values,
        before: beforeEnum.values,
        name: afterEnum.name,
        schema: afterEnum.schema,
      });
    }
  }

  const isEmpty =
    !dialectChanged &&
    addedTables.length === 0 &&
    removedTables.length === 0 &&
    modifiedTables.length === 0 &&
    addedEnums.length === 0 &&
    removedEnums.length === 0 &&
    modifiedEnums.length === 0;

  const touchedTables = new Set<string>([
    ...(dialectChanged
      ? [...before.tables, ...after.tables].map((t) => key(t.schema, t.name))
      : []),
    ...addedTables.map((t) => key(t.schema, t.name)),
    ...removedTables.map((t) => key(t.schema, t.name)),
    ...modifiedTables.map((t) => t.tableKey),
  ]);
  const changedEnums = new Set(
    [...addedEnums, ...removedEnums, ...modifiedEnums].map((e) =>
      JSON.stringify([e.schema, e.name])
    )
  );
  for (const table of [...before.tables, ...after.tables])
    if (
      table.columns.some(
        (c) =>
          c.type === "enum" &&
          changedEnums.has(
            JSON.stringify([c.enumSchema ?? "public", c.enumName])
          )
      )
    )
      touchedTables.add(key(table.schema, table.name));

  return {
    addedEnums,
    addedTables,
    dialectChanged,
    isEmpty,
    modifiedEnums,
    modifiedTables,
    removedEnums,
    removedTables,
    touchedTables,
  };
}

export interface ScopeCheckResult {
  inScope: boolean;
  unexpectedEnums: string[];
  /** Tables touched by the diff that were NOT in the expected/allowed set. */
  unexpectedTables: string[];
}

/**
 * The actual guardrail: checks that a diff only touched tables the
 * caller expected it to. Use this after any AI generation/refinement
 * call that produces full DBML text -- diff old vs new (via
 * diffSchemas), then call this with the table(s) the request was
 * actually about. Anything in touchedTables beyond that is a scope
 * violation the LLM introduced -- exactly what a structured-edit
 * approach would have prevented by construction, and what this
 * function exists to catch instead, given DBML-direct generation was
 * the chosen approach.
 */
export function checkDiffScope(
  diff: SchemaDiff,
  expectedTables: string[],
  expectedEnums: string[] = []
): ScopeCheckResult {
  const expected = new Set(expectedTables);
  const unexpectedTables = [...diff.touchedTables].filter(
    (t) => !expected.has(t)
  );
  const allowedEnums = new Set(expectedEnums);
  const unexpectedEnums = [
    ...new Set(
      [...diff.addedEnums, ...diff.removedEnums, ...diff.modifiedEnums].map(
        (e) => key(e.schema, e.name)
      )
    ),
  ].filter((name) => !allowedEnums.has(name));
  return {
    inScope:
      !diff.dialectChanged &&
      unexpectedTables.length === 0 &&
      unexpectedEnums.length === 0,
    unexpectedEnums,
    unexpectedTables,
  };
}
