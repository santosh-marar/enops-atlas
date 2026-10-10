import { generateFromCanonical, renderSeedSql } from "@enops/atlas-generators";
import { type CanonicalSchema, dbmlToSql } from "@enops/atlas-schema";
import { analyzeDbml } from "./atlas";

export type ExportFormat = "sql" | "prisma" | "drizzle";
export type SqlDialect = "postgres" | "mysql" | "mssql" | "oracle";

export type ExportResult =
  | { code: string; ok: true }
  | { messages: string[]; ok: false };

/** Generators refuse tables that carry seed records; those export as seed SQL instead. */
const withoutRecords = (schema: CanonicalSchema): CanonicalSchema => ({
  ...schema,
  tables: schema.tables.map(({ records: _records, ...table }) => table),
});

export function generateCode(
  dbml: string,
  format: ExportFormat,
  dialect: SqlDialect = "postgres"
): ExportResult {
  try {
    // Postgres SQL, Prisma and Drizzle come from the canonical generators.
    // The other SQL dialects are still written by the DBML exporter.
    if (format === "sql" && dialect !== "postgres") {
      return { code: dbmlToSql(dbml, dialect), ok: true };
    }
    const { canonical } = analyzeDbml(dbml);
    const result = generateFromCanonical(withoutRecords(canonical), {
      dialect: "postgres",
      format,
    });
    if (result.ok) return { code: result.code, ok: true };
    return {
      messages: result.diagnostics.map((issue) => issue.message),
      ok: false,
    };
  } catch (error) {
    return {
      messages: [error instanceof Error ? error.message : "Export failed"],
      ok: false,
    };
  }
}

/** Why an export would be refused, or an empty list when it will work. */
export function exportProblems(
  dbml: string,
  format: ExportFormat,
  dialect: SqlDialect = "postgres"
): string[] {
  if (!dbml.trim()) return [];
  const result = generateCode(dbml, format, dialect);
  return result.ok ? [] : result.messages;
}

export type SeedResult =
  | { ok: true; sql: string; tablesSeeded: string[] }
  | { message: string; ok: false };

/** INSERT statements for the `records` blocks, parents first. */
export function generateSeed(
  dbml: string,
  dialect: "postgres" | "mysql" = "postgres"
): SeedResult {
  try {
    const { canonical } = analyzeDbml(dbml);
    const { sql, tablesSeeded } = renderSeedSql(canonical, { dialect });
    if (tablesSeeded.length === 0) {
      return {
        message: "No seed data. Add a records block to a table first.",
        ok: false,
      };
    }
    return { ok: true, sql, tablesSeeded };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Seed export failed",
      ok: false,
    };
  }
}
