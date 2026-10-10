import { analyzeMigrationSql } from "@enops/atlas-generators";
import { canonicalDigest, diffSchemas } from "@enops/atlas-schema";
import {
  SCHEMA_SNAPSHOT_VERSION,
  schemaChanges,
  schemaSnapshot,
} from "@enops/atlas-schema-intelligence";
import { analyzeDbml } from "./atlas";

/** What a version stores, computed from DBML. */
export function snapshotOf(dbml: string) {
  const snapshot = schemaSnapshot(dbml);
  return {
    digest: canonicalDigest(snapshot.canonical),
    snapshotVersion: SCHEMA_SNAPSHOT_VERSION,
  };
}

/** True when saving would add nothing: the schema is the same as the last version. */
export function isSameAsLast(
  lastDigest: string | undefined,
  dbml: string
): boolean {
  return lastDigest !== undefined && snapshotOf(dbml).digest === lastDigest;
}

export interface ChangeSummary {
  addedTables: string[];
  changes: ReturnType<typeof schemaChanges>["changes"];
  isEmpty: boolean;
  modifiedColumns: string[];
  removedTables: string[];
}

/** What changed between two versions of the DBML, in plain lists. */
export function describeChange(
  beforeDbml: string,
  afterDbml: string
): ChangeSummary {
  const summary = schemaChanges(beforeDbml, afterDbml);
  const diff = diffSchemas(
    analyzeDbml(beforeDbml).canonical,
    analyzeDbml(afterDbml).canonical
  );
  const name = (table: { name: string; schema: string }) =>
    `${table.schema}.${table.name}`;
  return {
    addedTables: diff.addedTables.map(name),
    changes: summary.changes,
    isEmpty: summary.isEmpty,
    modifiedColumns: diff.modifiedTables.flatMap((table) =>
      table.modifiedColumns.map(
        (column) =>
          `${table.tableKey}.${column.name} (${column.changedFields.join(", ")})`
      )
    ),
    removedTables: diff.removedTables.map(name),
  };
}

/** Does this migration SQL lose data? */
export const checkMigration = analyzeMigrationSql;
