import type { CanonicalSchema, CanonicalTable } from "@enops/atlas-schema";

// Seed fixtures.
//
// Renders INSERT statements from DBML `records` blocks, ordered so referenced
// tables are seeded before their dependents. Portable across Postgres (double
// quotes) and MySQL (backticks).

export type SeedDialect = "mysql" | "postgres";

export interface SeedSqlResult {
  sql: string;
  tablesSeeded: string[];
}

function quoteIdentifier(name: string, dialect: SeedDialect): string {
  return dialect === "mysql"
    ? `\`${name.replaceAll("`", "``")}\``
    : `"${name.replaceAll('"', '""')}"`;
}

/** Table name, with its schema unless it is the default one. */
function qualifiedName(table: CanonicalTable, dialect: SeedDialect): string {
  const name = quoteIdentifier(table.name, dialect);
  return table.schema && table.schema !== "public"
    ? `${quoteIdentifier(table.schema, dialect)}.${name}`
    : name;
}

function literal(
  value: string | number | boolean | null,
  dialect: SeedDialect
): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  // MySQL treats a backslash inside a string as an escape; Postgres does not.
  const text = dialect === "mysql" ? value.replaceAll("\\", "\\\\") : value;
  return `'${text.replaceAll("'", "''")}'`;
}

const identity = (table: { name: string; schema: string }) =>
  `${table.schema}.${table.name}`;

/** Topologically sorts tables so referenced rows exist before dependents. */
function orderTables(tables: CanonicalTable[]): CanonicalTable[] {
  const byName = new Map(tables.map((table) => [identity(table), table]));
  const visited = new Set<string>();
  const ordered: CanonicalTable[] = [];

  const visit = (table: CanonicalTable, stack: Set<string>) => {
    const key = identity(table);
    if (visited.has(key) || stack.has(key)) return;
    stack.add(key);
    for (const foreignKey of table.foreignKeys) {
      const parent = byName.get(
        `${foreignKey.refTable.schema}.${foreignKey.refTable.table}`
      );
      if (parent) visit(parent, stack);
    }
    stack.delete(key);
    if (!visited.has(key)) {
      visited.add(key);
      ordered.push(table);
    }
  };

  for (const table of [...tables].sort((a, b) =>
    identity(a).localeCompare(identity(b))
  )) {
    visit(table, new Set());
  }
  return ordered;
}

export function renderSeedSql(
  schema: CanonicalSchema,
  options: { dialect?: SeedDialect } = {}
): SeedSqlResult {
  const dialect = options.dialect ?? "postgres";
  const statements: string[] = [];
  const tablesSeeded: string[] = [];

  for (const table of orderTables(schema.tables)) {
    const { records } = table;
    if (!records || records.rows.length === 0) continue;
    const { columns } = records;
    const columnList = columns
      .map((column) => quoteIdentifier(column, dialect))
      .join(", ");
    for (const row of records.rows) {
      const values = row
        .map((value) => literal(value.value, dialect))
        .join(", ");
      statements.push(
        `INSERT INTO ${qualifiedName(table, dialect)} (${columnList}) VALUES (${values});`
      );
    }
    tablesSeeded.push(identity(table));
  }

  return { sql: statements.join("\n"), tablesSeeded };
}
