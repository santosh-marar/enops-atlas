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

/** Fewer hints is better; the same hints is no better. */
export const hasImproved = (before: QualityBrief, after: QualityBrief) =>
  after.percent > before.percent || after.issues.length < before.issues.length;
