import {
  checkDirectionSanity,
  SchemaGraphEngine,
  validate,
  validateCanonicalStructure,
} from "@enops/atlas-schema-intelligence";
import { analyzeDbml } from "@/lib/atlas";

export interface ValidationError {
  code?: string;
  column: number;
  line: number;
  message: string;
  severity: "error" | "warning";
  table?: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  /** True when the DBML parses. Rule problems are shown but never block the diagram. */
  isValid: boolean;
}

interface DbmlDiagnostic {
  location?: { start?: { column?: number; line?: number } };
  message?: string;
  severity?: number;
}

// The parser reports line/column on the error it throws; the package has no
// structured return for syntax errors, so read them from there.
const parseDiagnostics = (error: unknown): ValidationError[] => {
  const diags = (error as { cause?: { diags?: DbmlDiagnostic[] } })?.cause
    ?.diags;
  if (Array.isArray(diags) && diags.length > 0) {
    return diags.map((diag) => ({
      column: diag.location?.start?.column ?? 1,
      line: diag.location?.start?.line ?? 1,
      message: diag.message ?? "Syntax error",
      severity: diag.severity === 1 ? "warning" : "error",
    }));
  }
  return [
    {
      column: 1,
      line: 1,
      message: error instanceof Error ? error.message : "Invalid DBML syntax",
      severity: "error",
    },
  ];
};

/** Finds the line of `Table <name>` for "schema.name" (or bare "name" in public). */
const locateTable = (dbml: string, fullName: string | undefined): number => {
  if (!fullName) return 1;
  const [schema = "public", name = fullName] = fullName.includes(".")
    ? [
        fullName.slice(0, fullName.indexOf(".")),
        fullName.slice(fullName.indexOf(".") + 1),
      ]
    : ["public", fullName];
  const lines = dbml.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*table\s+(.+?)(?:\s+as\s+\S+)?\s*(?:\{|\[|$)/i.exec(
      lines[index] ?? ""
    );
    if (!match?.[1]) continue;
    const declared = match[1].replaceAll('"', "").trim();
    if (declared === fullName || (schema === "public" && declared === name)) {
      return index + 1;
    }
  }
  return 1;
};

const collectProblems = (dbml: string): ValidationError[] => {
  const { canonical, parsed } = analyzeDbml(dbml);
  const problems: ValidationError[] = [];

  const rules = validate(parsed, new SchemaGraphEngine(parsed));
  for (const issue of rules.issues) {
    problems.push({
      code: issue.code,
      column: 1,
      line: locateTable(dbml, issue.table),
      message: issue.message,
      severity: issue.severity,
      table: issue.table,
    });
  }

  for (const issue of validateCanonicalStructure(canonical)) {
    problems.push({
      code: issue.code,
      column: 1,
      line: locateTable(dbml, issue.path.split(".primaryKey")[0]),
      message: `${issue.path}: ${issue.message}`,
      severity: "error",
    });
  }

  for (const flag of checkDirectionSanity(parsed).flags) {
    problems.push({
      code: flag.reason,
      column: 1,
      line: locateTable(dbml, flag.fromTable),
      message: flag.detail,
      severity: "warning",
      table: flag.fromTable,
    });
  }

  return problems;
};

/**
 * Validates DBML with the shared schema engine and returns structured
 * line/column diagnostics for the editor linter.
 */
export const validateDBML = async (dbml: string): Promise<ValidationResult> => {
  if (!dbml?.trim()) {
    return {
      errors: [
        {
          column: 1,
          line: 1,
          message: "DBML cannot be empty",
          severity: "error",
        },
      ],
      isValid: false,
    };
  }

  try {
    return { errors: collectProblems(dbml), isValid: true };
  } catch (error) {
    return { errors: parseDiagnostics(error), isValid: false };
  }
};
