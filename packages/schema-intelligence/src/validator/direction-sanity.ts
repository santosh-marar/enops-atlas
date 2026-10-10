/**
 * direction-sanity.ts
 *
 * Production safety net for BOTH generation pipelines. The benchmark
 * fixtures have hand-verified ground truth — real user prompts don't. This
 * module builds the best available heuristic signal for a schema with no
 * ground truth, and flags suspicious relationships instead of pretending to
 * fully automate correctness judgment.
 *
 * Two independent checks per relationship:
 *
 * 1. FK NAMING CONVENTION — the FK column should be named
 *    `{singular(referenced_table)}_id`. A mismatch is a signal, not a
 *    verdict: "author_id" referencing "users" is legitimate role-based
 *    naming, so mismatches are flagged at "medium" severity unless the
 *    column isn't even FK-shaped (doesn't end in "_id"), which is "high".
 *
 * 2. TARGET IS PK OR UNIQUE — the referenced column should be a primary key
 *    or unique. A Ref pointing at a non-PK, non-unique column is almost
 *    always backwards or malformed.
 *
 * This runs AFTER validate() and is non-blocking — flags are warnings
 * surfaced to the user/logs, not generation failures. It uses the REAL
 * nested RelationshipSchema shape (rel.from.table, rel.from.columns, etc.)
 * — this is deliberately the same shape the benchmark harness reads, so a
 * schema flagged here is checking the exact same thing the benchmark measures.
 */

import type { NormalizedSchema, RelationshipSchema } from "@enops/atlas-schema";
// Types
export type DirectionFlagReason =
  | "fk_name_mismatch"
  | "target_not_pk_or_unique";

export interface DirectionFlag {
  cardinality: string;
  detail: string;
  fromColumns: string[];
  fromTable: string;
  reason: DirectionFlagReason;
  /** "high" = very likely a real error. "medium" = worth a human look. */
  severity: "high" | "medium";
  toColumns: string[];
  toTable: string;
}

export interface DirectionSanityResult {
  /** flags.length / totalRelationships. 0 = clean. */
  flagRate: number;
  flags: DirectionFlag[];
  totalRelationships: number;
}
// Naming helpers
function singularize(name: string): string {
  if (name.endsWith("ies")) return name.slice(0, -3) + "y";
  if (
    name.endsWith("ses") ||
    name.endsWith("xes") ||
    name.endsWith("ches") ||
    name.endsWith("shes")
  ) {
    return name.slice(0, -2);
  }
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}

function expectedFkColumnName(referencedTable: string): string {
  return `${singularize(referencedTable)}_id`;
}
// Per-relationship checks
function checkFkNaming(rel: RelationshipSchema): DirectionFlag | null {
  // Only check single-column FKs — composite FKs don't follow this
  // convention cleanly and would produce noisy false positives.
  if (rel.from.columns.length !== 1) return null;

  const actualFkColumn = rel.from.columns[0]!;
  const expected = expectedFkColumnName(rel.to.table);

  if (actualFkColumn.toLowerCase() === expected.toLowerCase()) return null;

  // "author_id" referencing "users" is legitimate role-based naming — can't
  // reliably distinguish that from a real mistake, so downgrade to "medium"
  // when the column is at least structurally FK-shaped.
  const severity: "high" | "medium" = actualFkColumn.endsWith("_id")
    ? "medium"
    : "high";

  return {
    cardinality: rel.cardinality,
    detail:
      `Column "${actualFkColumn}" on "${rel.from.table}" references "${rel.to.table}", but naming ` +
      `convention would expect "${expected}". May indicate a backwards/misdirected relationship, ` +
      `or legitimate role-based naming (e.g. "author_id", "approved_by_id").`,
    fromColumns: rel.from.columns,
    fromTable: rel.from.table,
    reason: "fk_name_mismatch",
    severity,
    toColumns: rel.to.columns,
    toTable: rel.to.table,
  };
}

function checkTargetIsPkOrUnique(
  rel: RelationshipSchema,
  schema: NormalizedSchema
): DirectionFlag | null {
  if (rel.to.columns.length !== 1) return null; // composite targets, skip

  const toTable =
    schema.tables.get(`${rel.to.schema}.${rel.to.table}`) ??
    findTableByBareName(schema, rel.to.table);
  if (!toTable) return null; // missing table is validate()'s job, not ours

  const targetColName = rel.to.columns[0]!;
  const targetCol = toTable.columns.find((c) => c.name === targetColName);
  if (!targetCol) return null; // missing column is validate()'s job

  if (targetCol.primaryKey || targetCol.unique) return null; // fine

  return {
    cardinality: rel.cardinality,
    detail:
      `Relationship targets "${rel.to.table}.${targetColName}", which is neither a primary key nor ` +
      "unique. Foreign keys should almost always reference a PK or unique column — this may indicate " +
      "the Ref direction is reversed.",
    fromColumns: rel.from.columns,
    fromTable: rel.from.table,
    reason: "target_not_pk_or_unique",
    severity: "high",
    toColumns: rel.to.columns,
    toTable: rel.to.table,
  };
}

function findTableByBareName(schema: NormalizedSchema, bareName: string) {
  return [...schema.tables.values()].find((t) => t.name === bareName);
}

// checkDirectionSanity (main export)
/**
 * Runs both heuristic checks against every relationship in a NormalizedSchema.
 * Pure function — no AI calls. Safe to run on output from either pipeline.
 */
export function checkDirectionSanity(
  schema: NormalizedSchema
): DirectionSanityResult {
  const flags: DirectionFlag[] = [];

  for (const rel of schema.relationships) {
    const namingFlag = checkFkNaming(rel);
    if (namingFlag) flags.push(namingFlag);

    const targetFlag = checkTargetIsPkOrUnique(rel, schema);
    if (targetFlag) flags.push(targetFlag);
  }

  const totalRelationships = schema.relationships.length;
  const flagRate =
    totalRelationships === 0 ? 0 : flags.length / totalRelationships;

  return { flagRate, flags, totalRelationships };
}
