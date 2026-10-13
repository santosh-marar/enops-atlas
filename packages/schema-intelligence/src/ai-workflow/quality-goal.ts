import { normalize, parseDbml } from "@enops/atlas-schema";
import { type ConfidenceIssue, scoreSchema } from "../confidence/score";
import type { TablePlanEntry } from "./types";

/**
 * "Make it production ready", "improve the quality", "get it to 100%": the
 * request is about the schema as a whole, and the schema already has a quality
 * score with a list of hints. These requests do not need guessing about which
 * table is meant, or a model to plan: the plan is the list of hints.
 */
const QUALITY_REQUEST =
  /\b(quality|production[\s-]?ready|prod[\s-]?ready|best[\s-]?practices?|100\s*%|hundred percent|(optimi[sz]e|improve|harden|review)\s+(the\s+|my\s+|our\s+|this\s+)?(whole\s+|entire\s+)?(schema|database|design))\b/i;

export const isQualityRequest = (text: string) => QUALITY_REQUEST.test(text);

/** "Optimize performance", "make it faster", "it is slow at scale": a change to the whole schema's design. */
const PERFORMANCE_REQUEST =
  /\b(performance|performant|faster|speed\s*up|slow(?:er)?\s+quer(?:y|ies)|scal(?:e|ing|able)|bottleneck|optimi[sz]e)\b/i;

export const isPerformanceRequest = (text: string) =>
  PERFORMANCE_REQUEST.test(text);

/** Either kind of request is a change to the schema as a whole, never "unknown". */
export const isImprovementRequest = (text: string) =>
  isQualityRequest(text) || isPerformanceRequest(text);

export interface QualityBrief {
  issues: ConfidenceIssue[];
  /** 0 to 100. */
  percent: number;
  /** Tables the hints are about, in the schema's order. */
  tables: TablePlanEntry[];
}

/** The schema's quality score and hints, or null if the DBML cannot be read. */
export function qualityBriefOf(dbml: string): QualityBrief | null {
  if (!dbml.trim()) return null;
  try {
    const { schema } = normalize(parseDbml(dbml));
    const { issues, overall } = scoreSchema(schema);
    const named = new Set(issues.flatMap((issue) => issue.tables));
    return {
      issues: [...issues].sort(
        (a, b) => Number(b.isWarning) - Number(a.isWarning)
      ),
      percent: Math.round(overall * 100),
      tables: schema.tables
        .filter((table) => named.has(table.name))
        .map((table) => ({ isNew: false, name: table.name })),
    };
  } catch {
    return null;
  }
}

/** The hints as text for a prompt. */
export function renderQualityBrief(brief: QualityBrief): string {
  const lines = brief.issues.map(
    (issue) => `- ${issue.isWarning ? "WARNING" : "TIP"}: ${issue.suggestion}`
  );
  return [`Schema quality score: ${brief.percent}%.`, ...lines].join("\n");
}

/** What "production ready" means, beyond the scored hints. Given to the writer of the schema. */
export const PRODUCTION_CHECKLIST = `PRODUCTION READINESS: apply every hint above, and keep the schema safe to run in production.
- Every table has a primary key, created_at and updated_at.
- Every foreign key column is indexed, has the same type as the column it points at, and has an explicit delete behaviour ([delete: cascade] or [delete: set null] or [delete: restrict]) that fits the relationship.
- Columns that must always have a value are [not null]; identifiers a person signs in with (email, username) are [unique].
- A column that holds one of a few fixed values (status, role, type, channel, priority) is an Enum, not varchar.
- A junction table has a composite primary key or a unique index on its two foreign keys.
- Tables people can delete data from get deleted_at (soft delete) unless the data must be gone.
- A table with many columns, or one that is filtered or sorted by a column, gets an index on that column.
Do not rename or remove existing tables or columns, and do not change their meaning.`;

/** What "fast" means for a schema, given to the writer of the schema. */
export const PERFORMANCE_CHECKLIST = `PERFORMANCE: improve how fast the schema is to query and write, without changing what it stores.
- Index every foreign key column, and every column that is filtered, joined or sorted on often (status, created_at, owner and tenant ids).
- Where queries filter on two columns together, use one composite index with the most selective column first; drop an index another one already covers.
- Use the narrowest fitting type: integer or uuid keys, timestamp for times, numeric for money, enums for a few fixed values, not wide varchar or text for everything.
- Keep very large or rarely read columns (long text, json blobs) out of hot tables when they belong in their own table.
- Add partial or unique indexes for the common "active rows only" and lookup cases (for example unique email where deleted_at is null).
- Do not add an index that nothing would use; every index slows writes.
Do not rename or remove existing tables or columns, and do not change their meaning.`;

/** Fewer hints is better; the same hints is no better. */
export const hasImproved = (before: QualityBrief, after: QualityBrief) =>
  after.percent > before.percent || after.issues.length < before.issues.length;

/** The model answered, but not with anything usable (cut off, not JSON, wrong shape). */
export function isUnreadableReply(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "StoppedError") {
    return false;
  }
  return (
    [
      "AI_NoObjectGeneratedError",
      "AI_JSONParseError",
      "AI_TypeValidationError",
    ].includes(error.name) ||
    /could not parse|no object generated|json|validation/i.test(error.message)
  );
}

/** Every table in the schema, as a plan entry: used when the whole schema is the subject. */
export function allTablesOf(dbml: string): TablePlanEntry[] {
  try {
    const { schema } = normalize(parseDbml(dbml));
    return schema.tables.map((table) => ({ isNew: false, name: table.name }));
  } catch {
    return [];
  }
}
