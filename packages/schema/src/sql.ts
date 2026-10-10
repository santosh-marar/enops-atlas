import { importer, ModelExporter, Parser } from "@dbml/core";

export type SqlImportDialect =
  | "mssql"
  | "mysql"
  | "oracle"
  | "postgres"
  | "snowflake";

export type SqlExportDialect = "mssql" | "mysql" | "oracle" | "postgres";

const describeError = (error: unknown): string => {
  const diags = (error as { diags?: Array<{ message?: string }> })?.diags;
  if (Array.isArray(diags) && diags.length > 0) {
    return diags[0]?.message ?? "Unknown error";
  }
  return error instanceof Error ? error.message : "Unknown error";
};

/**
 * Import SQL DDL into DBML. Dialect-aware interop for tools that receive
 * database dumps; the canonical path stays `parseDbml` -> `normalize`.
 */
export function sqlToDbml(
  sql: string,
  dialect: SqlImportDialect = "postgres"
): string {
  try {
    return importer.import(sql, dialect);
  } catch (error) {
    throw new Error(`SQL import error: ${describeError(error)}`, {
      cause: error,
    });
  }
}

// DBML-only type spellings with no literal equivalent in a given SQL
// dialect; @dbml/core exports column types verbatim, so these are
// translated first to avoid emitting invalid DDL (e.g. postgres has no
// `datetime` type - only `timestamp`).
const DIALECT_TYPE_ALIASES: Partial<
  Record<SqlExportDialect, Record<string, string>>
> = {
  oracle: { datetime: "timestamp" },
  postgres: { datetime: "timestamp" },
};

function applyDialectTypeAliases(
  model: ReturnType<Parser["parse"]>,
  dialect: SqlExportDialect
): void {
  const aliases = DIALECT_TYPE_ALIASES[dialect];
  if (!aliases) return;
  for (const schema of model.schemas)
    for (const table of schema.tables)
      for (const field of table.fields) {
        const replacement = aliases[field.type?.type_name?.toLowerCase()];
        if (replacement) field.type.type_name = replacement;
      }
}

/**
 * Export DBML to raw SQL DDL for the supported dialects. This is the
 * dialect-wide interop writer; deterministic generation from the canonical IR
 * lives in `@enops/atlas-generators`.
 */
export function dbmlToSql(
  dbml: string,
  dialect: SqlExportDialect = "postgres"
): string {
  try {
    const model = new Parser().parse(dbml, "dbmlv2");
    applyDialectTypeAliases(model, dialect);
    return ModelExporter.export(model, dialect);
  } catch (error) {
    throw new Error(`SQL export error: ${describeError(error)}`, {
      cause: error,
    });
  }
}
