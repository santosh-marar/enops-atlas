// Destructive migration analysis.
//
// Migration SQL generated in a sandbox is scanned for statements that can
// lose data. Findings become evidence the caller must surface for approval.

export interface DestructiveFinding {
  reason: string;
  statement: string;
}

export interface MigrationAnalysis {
  destructive: boolean;
  findings: DestructiveFinding[];
  statements: number;
}

interface Rule {
  reason: string;
  test: RegExp;
}

const RULES: Rule[] = [
  { reason: "drops a table", test: /\bdrop\s+table\b/i },
  { reason: "drops a column", test: /\bdrop\s+column\b/i },
  { reason: "truncates a table", test: /\btruncate\b/i },
  { reason: "drops a schema or type", test: /\bdrop\s+(schema|type|enum)\b/i },
  {
    reason: "deletes rows without a WHERE clause",
    test: /\bdelete\s+from\b(?![^;]*\bwhere\b)/i,
  },
  {
    reason: "changes a column type (may truncate data)",
    test: /\balter\s+column\b[^;]*\b(type|set\s+data\s+type)\b/i,
  },
  {
    reason: "modifies a column type (MySQL)",
    test: /\bmodify\s+column\b/i,
  },
];

function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function analyzeMigrationSql(sql: string): MigrationAnalysis {
  const cleaned = stripComments(sql);
  if (!cleaned) return { destructive: false, findings: [], statements: 0 };

  const statements = cleaned
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const findings: DestructiveFinding[] = [];
  for (const statement of statements) {
    for (const rule of RULES) {
      if (rule.test.test(statement)) {
        findings.push({
          reason: rule.reason,
          statement:
            statement.length > 300 ? `${statement.slice(0, 300)}…` : statement,
        });
        break;
      }
    }
  }
  return {
    destructive: findings.length > 0,
    findings,
    statements: statements.length,
  };
}
