import type { CanonicalSchema, CanonicalTable } from "@enops/atlas-schema";

// Types

export type ConfidenceIssueKind =
  | "missing_created_at"
  | "missing_updated_at"
  | "missing_audit_cols" // neither created_at nor updated_at
  | "no_index_on_fk" // FK column has no index (slow joins at scale)
  | "no_soft_delete" // table has no deleted_at or is_deleted column
  | "missing_unique_email" // users-like table has email column without unique constraint
  | "enum_as_string" // column name implies enum semantics but type is string/text, not enum
  | "large_table_no_index"; // table with 8+ columns has no non-PK indexes

export interface ConfidenceIssue {
  /** True = structural concern. False = best practice suggestion. */
  isWarning: boolean;
  kind: ConfidenceIssueKind;
  suggestion: string;
  tables: string[];
}

export interface SchemaConfidence {
  issues: ConfidenceIssue[];
  /** 0–1. Higher is better. Below 0.6 surfaces a banner in the UI. */
  overall: number;
}

// Column name helpers

const SOFT_DELETE_COLS = new Set([
  "deleted_at",
  "is_deleted",
  "archived_at",
  "deactivated_at",
]);
const STATUS_LIKE_NAMES = /^(status|state|type|kind|role|category|tier)$/i;

// Per-table checks

function checkAuditCols(table: CanonicalTable): ConfidenceIssue | null {
  const colNames = new Set(table.columns.map((c) => c.name));
  const hasCreated = colNames.has("created_at");
  const hasUpdated = colNames.has("updated_at");

  if (!(hasCreated || hasUpdated)) {
    return {
      isWarning: false,
      kind: "missing_audit_cols",
      suggestion: `Table \`${table.name}\` has no \`created_at\` or \`updated_at\`. Consider adding audit timestamps.`,
      tables: [table.name],
    };
  }
  if (!hasCreated) {
    return {
      isWarning: false,
      kind: "missing_created_at",
      suggestion: `Table \`${table.name}\` has \`updated_at\` but no \`created_at\`.`,
      tables: [table.name],
    };
  }
  if (!hasUpdated) {
    return {
      isWarning: false,
      kind: "missing_updated_at",
      suggestion: `Table \`${table.name}\` has \`created_at\` but no \`updated_at\`.`,
      tables: [table.name],
    };
  }
  return null;
}

function checkSoftDelete(table: CanonicalTable): ConfidenceIssue | null {
  // Only flag tables that look like primary business entities, not join/audit tables.
  if (table.columns.length < 4) return null;

  const colNames = new Set(table.columns.map((c) => c.name));
  const hasSoftDelete = [...colNames].some((n) => SOFT_DELETE_COLS.has(n));

  if (!hasSoftDelete) {
    return {
      isWarning: false,
      kind: "no_soft_delete",
      suggestion: `Table \`${table.name}\` has no soft-delete column (\`deleted_at\`, \`is_deleted\`). Consider whether records should be recoverable.`,
      tables: [table.name],
    };
  }
  return null;
}

function checkUniqueEmail(table: CanonicalTable): ConfidenceIssue | null {
  const emailCol = table.columns.find((c) => c.name === "email");
  if (!emailCol) return null;

  const hasUnique =
    emailCol.unique ||
    table.uniqueConstraints.some((uc) => uc.columns.includes("email"));

  if (!hasUnique) {
    return {
      isWarning: true,
      kind: "missing_unique_email",
      suggestion: `Table \`${table.name}\` has an \`email\` column without a UNIQUE constraint. Duplicate emails will cause auth issues.`,
      tables: [table.name],
    };
  }
  return null;
}

function checkEnumAsString(table: CanonicalTable): ConfidenceIssue | null {
  // CanonicalType is closed: a status-like column typed "string" or "text"
  // (bounded/unbounded text) rather than "enum" is a candidate for a real
  // database enum. If type is already "enum", enumName will be set and this
  // check correctly skips it.
  const suspects = table.columns.filter(
    (c) =>
      STATUS_LIKE_NAMES.test(c.name) &&
      (c.type === "string" || c.type === "text")
  );

  if (suspects.length === 0) return null;

  return {
    isWarning: false,
    kind: "enum_as_string",
    suggestion: `Table \`${table.name}\` has column${suspects.length > 1 ? "s" : ""} \`${suspects
      .map((c) => c.name)
      .join(
        "`, `"
      )}\` typed as plain text — consider a database enum for type safety.`,
    tables: [table.name],
  };
}

function checkLargeTableIndexes(table: CanonicalTable): ConfidenceIssue | null {
  if (table.columns.length < 8) return null;
  if (table.indexes.length === 0) {
    return {
      isWarning: false,
      kind: "large_table_no_index",
      suggestion: `Table \`${table.name}\` has ${table.columns.length} columns but no indexes. Consider indexes on frequently queried columns.`,
      tables: [table.name],
    };
  }
  return null;
}

// FK index check
// Foreign keys live per-table in CanonicalSchema (table.foreignKeys), unlike
// NormalizedSchema where relationships are a flat schema-level array. This
// is actually simpler to check — no cross-table lookup needed, everything
// relevant is already on the table that holds the FK.

function checkFkIndexes(table: CanonicalTable): ConfidenceIssue[] {
  const issues: ConfidenceIssue[] = [];

  for (const fk of table.foreignKeys) {
    for (const fkCol of fk.columns) {
      // A unique constraint is backed by an index, so it counts too.
      const hasIndex =
        table.indexes.some((idx) => idx.columns.includes(fkCol)) ||
        table.uniqueConstraints.some((u) => u.columns.includes(fkCol)) ||
        (table.primaryKey?.columns.includes(fkCol) ?? false) ||
        table.columns.some(
          (c) => c.name === fkCol && (c.primaryKey || c.unique)
        );
      const target =
        fk.refTable.schema === "public"
          ? fk.refTable.table
          : `${fk.refTable.schema}.${fk.refTable.table}`;

      if (!hasIndex) {
        issues.push({
          isWarning: true,
          kind: "no_index_on_fk",
          suggestion: `Column \`${fkCol}\` on \`${table.name}\` is a foreign key (references \`${target}\`) but has no index. Joins on this column will be slow at scale.`,
          tables: [table.name],
        });
      }
    }
  }

  return issues;
}

// scoreSchema

/**
 * Runs a set of heuristic checks on a CanonicalSchema and returns a confidence
 * score (0–1) and a list of issues.
 *
 * CanonicalSchema.tables is an ARRAY (not a Map, unlike NormalizedSchema) —
 * iterate directly, no .values() needed.
 *
 * Scoring:
 * - Start at 1.0
 * - Each warning issue: -0.05
 * - Each non-warning issue: -0.02
 * - Floor: 0.0
 *
 * Empty schemas score 0.5 (the EMPTY_SCHEMA validator warning already covers this).
 */
export function scoreSchema(schema: CanonicalSchema): SchemaConfidence {
  if (schema.tables.length === 0) {
    return { issues: [], overall: 0.5 };
  }

  const issues: ConfidenceIssue[] = [];

  for (const table of schema.tables) {
    const checks = [
      checkAuditCols(table),
      checkSoftDelete(table),
      checkUniqueEmail(table),
      checkEnumAsString(table),
      checkLargeTableIndexes(table),
    ];
    for (const issue of checks) {
      if (issue) issues.push(issue);
    }
    issues.push(...checkFkIndexes(table));
  }

  let score = 1.0;
  for (const issue of issues) {
    score -= issue.isWarning ? 0.05 : 0.02;
  }
  score = Math.max(0, Math.round(score * 100) / 100);

  return { issues, overall: score };
}
