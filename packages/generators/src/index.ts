import type {
  CanonicalSchema,
  SchemaDiagnostic,
  SchemaTarget,
} from "@enops/atlas-schema";
import { renderDbml, validateCanonicalStructure } from "@enops/atlas-schema";
import { GenerationError } from "./capabilities";
import { generateDrizzleSchema } from "./drizzle";
import { generatePrismaSchema } from "./prisma";
import { generatePostgresSql } from "./sql";

export { generateDrizzleSchema } from "./drizzle";
export * from "./migration-analysis";
export { generatePrismaConfig, generatePrismaSchema } from "./prisma";
export * from "./seed-sql";
export { generatePostgresSql } from "./sql";

export type CanonicalGeneration =
  | { code: string; format: SchemaTarget["format"]; ok: true }
  | { diagnostics: SchemaDiagnostic[]; ok: false };

/**
 * Deterministic emission from the canonical IR for every supported target.
 * Unlike `assessSchemaTarget`, this actually produces output instead of
 * reporting ADAPTER_NOT_IMPLEMENTED.
 */
export function generateFromCanonical(
  schema: CanonicalSchema,
  target: SchemaTarget
): CanonicalGeneration {
  const diagnostics: SchemaDiagnostic[] = [
    ...validateCanonicalStructure(schema),
  ];
  if (schema.version !== 2) {
    diagnostics.push({
      code: "SCHEMA_VERSION",
      message:
        "Reparse the authoritative source to produce canonical v2 before generating",
      path: "schema",
    });
  }
  if (
    target.dialect &&
    target.dialect !== "unknown" &&
    ((target.format !== "dbml" && target.dialect !== "postgres") ||
      (schema.dialect &&
        schema.dialect !== "unknown" &&
        schema.dialect !== target.dialect))
  ) {
    diagnostics.push({
      code: "DIALECT_MISMATCH",
      message: "Cross-dialect translation is not supported",
      path: "target.dialect",
    });
  }
  if (diagnostics.length > 0) return { diagnostics, ok: false };

  try {
    switch (target.format) {
      case "dbml":
        return { code: renderDbml(schema), format: "dbml", ok: true };
      case "sql":
        return { code: generatePostgresSql(schema), format: "sql", ok: true };
      case "prisma":
        return {
          code: generatePrismaSchema(schema),
          format: "prisma",
          ok: true,
        };
      case "drizzle":
        return {
          code: generateDrizzleSchema(schema),
          format: "drizzle",
          ok: true,
        };
      default:
        return {
          diagnostics: [
            {
              code: "ADAPTER_NOT_IMPLEMENTED",
              message: `Unsupported generation target: ${String(target.format)}`,
              path: "target.format",
            },
          ],
          ok: false,
        };
    }
  } catch (error) {
    if (error instanceof GenerationError)
      return { diagnostics: error.diagnostics, ok: false };
    return {
      diagnostics: [
        {
          code: "UNREPRESENTABLE",
          message: error instanceof Error ? error.message : "Generation failed",
          path: "schema",
        },
      ],
      ok: false,
    };
  }
}
