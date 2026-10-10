import type { SchemaGraphEngine as SchemaGraph } from "@enops/atlas-graph";
import type { NormalizedSchema } from "@enops/atlas-schema";

//  result types

export type ValidationSeverity = "error" | "warning";

export type ValidationCode =
  // errors
  | "CYCLE_DETECTED"
  | "MISSING_PRIMARY_KEY"
  | "DUPLICATE_COLUMN_NAME"
  | "INVALID_ENUM_REF"
  | "FK_COLUMN_NOT_FOUND"
  | "COMPOSITE_FK_COLUMN_COUNT_MISMATCH"
  // warnings
  | "ISOLATED_TABLE"
  | "NULLABLE_FK_COLUMN"
  | "EMPTY_TABLE"
  | "EMPTY_SCHEMA"
  | "DUPLICATE_RELATIONSHIP";

export interface ValidationIssue {
  code: ValidationCode;
  /** Column name(s) involved, if applicable */
  columns?: string[];
  message: string;
  severity: ValidationSeverity;
  /** fullName of the table involved, if applicable */
  table?: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  /** All issues in a single flat array, errors first */
  issues: ValidationIssue[];
  valid: boolean; // true only when zero errors (warnings are ok)
  warnings: ValidationIssue[];
}

//  validator

export function validate(
  schema: NormalizedSchema,
  graph: SchemaGraph
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const err = (
    code: ValidationCode,
    message: string,
    extra?: Pick<ValidationIssue, "table" | "columns">
  ) => errors.push({ code, message, severity: "error", ...extra });

  const warn = (
    code: ValidationCode,
    message: string,
    extra?: Pick<ValidationIssue, "table" | "columns">
  ) => warnings.push({ code, message, severity: "warning", ...extra });

  //  E0: empty schema
  if (schema.tables.size === 0) {
    warn("EMPTY_SCHEMA", "Schema has no tables.");
    return finish(errors, warnings);
  }

  //  E1: cycles ─
  const cycles = graph.detectCycles();
  for (const cycle of cycles) {
    err(
      "CYCLE_DETECTED",
      `Circular reference detected: ${cycle.join(" → ")} → ${cycle[0]}`,
      { table: cycle[0] }
    );
  }

  // per-table checks
  for (const [fullName, table] of schema.tables) {
    //  E2: empty table ─
    if (table.columns.length === 0) {
      warn("EMPTY_TABLE", `Table "${fullName}" has no columns.`, {
        table: fullName,
      });
      continue; // remaining checks need columns
    }

    //  E3: missing primary key ─
    const hasPkColumn = table.columns.some((c) => c.primaryKey);
    const hasPkIndex = table.indexes.some((i) => i.pk);
    if (!(hasPkColumn || hasPkIndex)) {
      err("MISSING_PRIMARY_KEY", `Table "${fullName}" has no primary key.`, {
        table: fullName,
      });
    }

    //  E4: duplicate column names
    const seen = new Set<string>();
    for (const col of table.columns) {
      if (seen.has(col.name)) {
        err(
          "DUPLICATE_COLUMN_NAME",
          `Table "${fullName}" has duplicate column "${col.name}".`,
          { columns: [col.name], table: fullName }
        );
      }
      seen.add(col.name);
    }

    //  E5: invalid enum refs ─
    for (const col of table.columns) {
      if (col.enumRef === null) continue;
      // enumRef is bare name (e.g. "order_status") — check both public.X and schema.X
      const qualifiedPublic = `public.${col.enumRef}`;
      const qualifiedSame = `${table.schema}.${col.enumRef}`;
      if (
        !(col.enumSchema
          ? schema.enums.has(`${col.enumSchema}.${col.enumRef}`)
          : schema.enums.has(qualifiedPublic) ||
            schema.enums.has(qualifiedSame))
      ) {
        err(
          "INVALID_ENUM_REF",
          `Column "${fullName}.${col.name}" references unknown enum "${col.enumRef}".`,
          { columns: [col.name], table: fullName }
        );
      }
    }

    //  W1: isolated tables ─
    if (graph.getIsolatedTables().includes(fullName)) {
      warn(
        "ISOLATED_TABLE",
        `Table "${fullName}" has no relationships (no foreign keys in or out).`,
        { table: fullName }
      );
    }
  }

  //  relationship checks ─
  const relSeen = new Set<string>();

  for (const rel of schema.relationships) {
    const fromFullName = `${rel.from.schema}.${rel.from.table}`;
    const toFullName = `${rel.to.schema}.${rel.to.table}`;

    const fromTable = schema.tables.get(fromFullName);
    const toTable = schema.tables.get(toFullName);

    if (!(fromTable && toTable)) continue; // unknown table — parser would have caught this

    //  E6: FK column not found ─
    for (const colName of rel.from.columns) {
      if (!fromTable.columns.some((c) => c.name === colName)) {
        err(
          "FK_COLUMN_NOT_FOUND",
          `Relationship references column "${fromFullName}.${colName}" which does not exist.`,
          { columns: [colName], table: fromFullName }
        );
      }
    }
    for (const colName of rel.to.columns) {
      if (!toTable.columns.some((c) => c.name === colName)) {
        err(
          "FK_COLUMN_NOT_FOUND",
          `Relationship references column "${toFullName}.${colName}" which does not exist.`,
          { columns: [colName], table: toFullName }
        );
      }
    }

    //  E7: composite FK column count mismatch
    if (rel.from.columns.length !== rel.to.columns.length) {
      err(
        "COMPOSITE_FK_COLUMN_COUNT_MISMATCH",
        `Composite FK from "${fromFullName}" (${rel.from.columns.join(", ")}) ` +
          `to "${toFullName}" (${rel.to.columns.join(", ")}) has mismatched column counts.`,
        { columns: rel.from.columns, table: fromFullName }
      );
    }

    //  W2: nullable FK column
    for (const colName of rel.from.columns) {
      const col = fromTable.columns.find((c) => c.name === colName);
      if (col?.nullable) {
        warn(
          "NULLABLE_FK_COLUMN",
          `FK column "${fromFullName}.${colName}" is nullable — consider adding [not null] if the relationship is required.`,
          { columns: [colName], table: fromFullName }
        );
      }
    }

    //  W3: duplicate relationship
    const relKey = `${fromFullName}(${rel.from.columns.join(",")})→${toFullName}(${rel.to.columns.join(",")})`;
    if (relSeen.has(relKey)) {
      warn(
        "DUPLICATE_RELATIONSHIP",
        `Duplicate relationship from "${fromFullName}.${rel.from.columns.join(", ")}" to "${toFullName}.${rel.to.columns.join(", ")}".`,
        { columns: rel.from.columns, table: fromFullName }
      );
    }
    relSeen.add(relKey);
  }

  return finish(errors, warnings);
}

function finish(
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): ValidationResult {
  return {
    errors,
    issues: [...errors, ...warnings],
    valid: errors.length === 0,
    warnings,
  };
}
