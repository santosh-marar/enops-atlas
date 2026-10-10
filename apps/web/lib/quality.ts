import {
  type ConfidenceIssue,
  scoreSchema,
} from "@enops/atlas-schema-intelligence";
import { analyzeDbml } from "./atlas";

export interface QualityReport {
  /** Structural concerns first, then best-practice hints. */
  issues: ConfidenceIssue[];
  /** 0 to 100, higher is better. */
  percent: number;
}

/** Hints about how good the schema is. They are advice, never errors. */
export function scoreDbml(dbml: string): QualityReport | null {
  if (!dbml.trim()) return null;
  try {
    const { overall, issues } = scoreSchema(analyzeDbml(dbml).canonical);
    return {
      issues: [...issues].sort(
        (a, b) => Number(b.isWarning) - Number(a.isWarning)
      ),
      percent: Math.round(overall * 100),
    };
  } catch {
    return null;
  }
}
