import type { ChangeRequest } from "@enops/atlas-graph";
import type { CanonicalSchema } from "@enops/atlas-schema";
import { exportCanonicalDbml } from "@enops/atlas-schema";
import { analyzeDbml } from "./atlas";

/**
 * Applies a removal to a copy of the schema, and removes everything that
 * would otherwise be left pointing at it (foreign keys, indexes, keys).
 */
export function applyRemoval(
  schema: CanonicalSchema,
  change: ChangeRequest
): CanonicalSchema {
  const next = structuredClone(schema);

  if (change.kind === "remove-table") {
    next.tables = next.tables.filter(
      (table) =>
        !(table.schema === change.schema && table.name === change.table)
    );
    for (const table of next.tables) {
      table.foreignKeys = table.foreignKeys.filter(
        (fk) =>
          !(
            fk.refTable.schema === change.schema &&
            fk.refTable.table === change.table
          )
      );
    }
    return next;
  }

  if (change.kind === "remove-column") {
    for (const table of next.tables) {
      const isOwner =
        table.schema === change.schema && table.name === change.table;
      if (isOwner) {
        table.columns = table.columns.filter((c) => c.name !== change.column);
        table.foreignKeys = table.foreignKeys.filter(
          (fk) => !fk.columns.includes(change.column)
        );
        table.indexes = table.indexes.filter(
          (index) => !index.columns.includes(change.column)
        );
        table.uniqueConstraints = table.uniqueConstraints.filter(
          (unique) => !unique.columns.includes(change.column)
        );
        if (table.primaryKey?.columns.includes(change.column)) {
          const columns = table.primaryKey.columns.filter(
            (name) => name !== change.column
          );
          table.primaryKey =
            columns.length > 0 ? { ...table.primaryKey, columns } : undefined;
        }
      }
      table.foreignKeys = table.foreignKeys.filter(
        (fk) =>
          !(
            fk.refTable.schema === change.schema &&
            fk.refTable.table === change.table &&
            fk.refColumns.includes(change.column)
          )
      );
    }
    return next;
  }

  throw new Error("Removing enums is not supported here");
}

/** DBML text with the removal applied. Comments are not kept. */
export function dbmlAfterRemoval(dbml: string, change: ChangeRequest): string {
  const { canonical } = analyzeDbml(dbml);
  const result = exportCanonicalDbml(applyRemoval(canonical, change));
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map((issue) => issue.message).join("; ")
    );
  }
  return result.dbml;
}
