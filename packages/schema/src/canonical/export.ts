import { renderDbml } from "../dbml/render";
import type { SchemaDialect } from "../dbml/types";
import type { CanonicalSchema } from "./types";
import { validateCanonicalStructure } from "./validate";

export type SchemaTarget = {
  format: "dbml" | "prisma" | "drizzle" | "sql";
  dialect?: SchemaDialect;
};
export type SchemaDiagnostic = {
  code:
    | "INVALID_STRUCTURE"
    | "UNREPRESENTABLE"
    | "SCHEMA_VERSION"
    | "DIALECT_MISMATCH"
    | "ADAPTER_NOT_IMPLEMENTED"
    | "UNSUPPORTED_TYPE"
    | "UNSUPPORTED_RECORDS";
  path: string;
  message: string;
};

/** Capability boundary. A portable graph type is not permission to translate
 * a native type or SQL expression into another database's semantics.
 */
export function assessSchemaTarget(
  schema: CanonicalSchema,
  target: SchemaTarget
): SchemaDiagnostic[] {
  const diagnostics: SchemaDiagnostic[] = [
    ...validateCanonicalStructure(schema),
  ];
  if (schema.version !== 2)
    diagnostics.push({
      code: "SCHEMA_VERSION",
      message:
        "Reparse the authoritative source to produce canonical v2; legacy objects are not safe export inputs",
      path: "schema",
    });
  if (target.dialect && target.dialect !== (schema.dialect ?? "unknown"))
    diagnostics.push({
      code: "DIALECT_MISMATCH",
      message:
        "Cross-dialect translation requires an explicit capability-aware adapter; native types/defaults cannot be copied blindly",
      path: "schema.dialect",
    });
  if (target.format !== "dbml")
    diagnostics.push({
      code: "ADAPTER_NOT_IMPLEMENTED",
      message: `Verified ${target.format} emission is not implemented by this foundation`,
      path: "target.format",
    });
  for (const table of schema.tables) {
    if (table.records)
      diagnostics.push({
        code: "UNSUPPORTED_RECORDS",
        message: "Seed records need a separate lossless data adapter",
        path: `${table.schema}.${table.name}`,
      });
    for (const column of table.columns)
      if (column.type === "unsupported")
        diagnostics.push({
          code: "UNSUPPORTED_TYPE",
          message: `Native type ${column.nativeType?.name ?? "unknown"} is retained but not verified for generated-code export`,
          path: `${table.schema}.${table.name}.${column.name}`,
        });
  }
  return diagnostics;
}

export function exportCanonicalDbml(
  schema: CanonicalSchema,
  dialect?: SchemaDialect
): { ok: true; dbml: string } | { ok: false; diagnostics: SchemaDiagnostic[] } {
  const diagnostics = assessSchemaTarget(schema, { dialect, format: "dbml" });
  if (diagnostics.length) return { diagnostics, ok: false };
  try {
    return { dbml: renderDbml(schema), ok: true };
  } catch (error) {
    return {
      diagnostics: [
        {
          code: "UNREPRESENTABLE",
          message:
            error instanceof Error ? error.message : "DBML export failed",
          path: "schema",
        },
      ],
      ok: false,
    };
  }
}
