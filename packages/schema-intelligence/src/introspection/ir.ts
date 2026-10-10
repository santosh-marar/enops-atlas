import type {
  CanonicalColumn,
  CanonicalEnum,
  CanonicalSchema,
  CanonicalTable,
  CanonicalType,
  CheckSchema,
  ColumnDefault,
  IndexElement,
  IndexType,
} from "@enops/atlas-schema";
import { normalize, parseDbml, renderDbml } from "@enops/atlas-schema";

// Database introspection IR.
//
// Both live drivers (Postgres, MySQL) produce this shape; the canonical
// builder and capability report are pure so they can be unit-tested without
// a database.

export type IntrospectedDialect = "mysql" | "postgres";

export interface IntrospectedColumn {
  autoIncrement: boolean;
  default: string | null;
  defaultValue?: ColumnDefault;
  enumName?: string;
  enumSchema?: string;
  enumValues?: string[];
  name: string;
  nativeType: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
}

export interface IntrospectedForeignKey {
  columns: string[];
  name?: string;
  onDelete: string | null;
  onUpdate: string | null;
  refColumns: string[];
  refSchema?: string;
  refTable: string;
}

export interface IntrospectedIndex {
  columns: string[];
  elements?: IndexElement[];
  name: string;
  type?: IndexType;
  unique: boolean;
}

export interface IntrospectedTable {
  checks?: CheckSchema[];
  columns: IntrospectedColumn[];
  foreignKeys: IntrospectedForeignKey[];
  indexes: IntrospectedIndex[];
  name: string;
  primaryKey?: { columns: string[]; name?: string };
  schema: string;
}

export interface IntrospectedDatabase {
  dialect: IntrospectedDialect;
  tables: IntrospectedTable[];
}

export interface TypeMapping {
  length?: number;
  precision?: [number, number];
  type: CanonicalType;
}

/** Maps a native database type onto the canonical type system. */
export function mapNativeType(raw: string): TypeMapping {
  const type = raw.trim().toLowerCase();
  const lengthMatch = type.match(/\((\d+)\)/);
  const precisionMatch = type.match(/\((\d+)\s*,\s*(\d+)\)/);

  if (type.startsWith("enum")) return { type: "enum" };
  if (type === "uuid" || type === "uniqueidentifier") return { type: "uuid" };
  if (type === "json" || type === "jsonb") return { type: "json" };
  if (type === "boolean" || type === "bool" || type === "tinyint(1)") {
    return { type: "boolean" };
  }
  if (type === "date") return { type: "date" };
  if (
    type.startsWith("timestamp") ||
    type.startsWith("datetime") ||
    type === "timestamptz"
  ) {
    return { type: "timestamp" };
  }
  if (
    type.startsWith("numeric") ||
    type.startsWith("decimal") ||
    type === "money"
  ) {
    return {
      precision:
        precisionMatch && precisionMatch[1] && precisionMatch[2]
          ? [Number(precisionMatch[1]), Number(precisionMatch[2])]
          : undefined,
      type: "decimal",
    };
  }
  if (
    type.includes("double") ||
    type.includes("real") ||
    type === "float" ||
    type === "float4" ||
    type === "float8"
  ) {
    return { type: "float" };
  }
  if (/^(bigint|int8|bigserial)(?:\(\d+\))?(?: unsigned)?$/.test(type)) {
    return { type: "bigint" };
  }
  if (
    type === "int" ||
    type === "integer" ||
    type === "int4" ||
    type === "smallint" ||
    type === "int2" ||
    type === "serial" ||
    type === "smallserial" ||
    /^(tinyint|smallint|mediumint|int|integer)(?:\(\d+\))?(?: unsigned)?$/.test(
      type
    )
  ) {
    return { type: "int" };
  }
  if (
    type === "text" ||
    type.includes("text") ||
    type === "clob" ||
    type === "tinytext"
  ) {
    return { type: "text" };
  }
  if (
    type.startsWith("varchar") ||
    type.startsWith("character varying") ||
    type.startsWith("char") ||
    type.startsWith("nvarchar")
  ) {
    return {
      length: lengthMatch?.[1] ? Number(lengthMatch[1]) : undefined,
      type: "string",
    };
  }

  return { type: "unsupported" };
}

function toCanonicalColumn(
  column: IntrospectedColumn,
  table: IntrospectedTable
): CanonicalColumn {
  const mapping: TypeMapping = column.enumValues
    ? { type: "enum" as const }
    : mapNativeType(column.nativeType);
  const enumName =
    column.enumName ??
    (column.nativeType === "enum"
      ? "enum"
      : `${table.name}_${column.name}_enum`);
  return {
    autoIncrement: column.autoIncrement,
    default:
      column.defaultValue ??
      (column.default === null || column.autoIncrement
        ? undefined
        : { type: "expression", value: column.default }),
    ...(mapping.type === "enum"
      ? { enumName, enumSchema: column.enumSchema ?? table.schema }
      : {}),
    length: mapping.length,
    name: column.name,
    nativeType: { args: null, name: column.nativeType },
    nullable: column.nullable,
    precision: mapping.precision,
    primaryKey: column.primaryKey,
    type: mapping.type,
    unique: column.unique,
  };
}

/** Produces canonical v2 without discarding enum identities or constraint order. */
export function introspectedToCanonical(
  database: IntrospectedDatabase
): CanonicalSchema {
  const enums = new Map<string, CanonicalEnum>();
  const tables: CanonicalTable[] = database.tables
    .map((table) => {
      const primary = table.primaryKey ?? {
        columns: table.columns.filter((c) => c.primaryKey).map((c) => c.name),
      };
      const columns = table.columns.map((column) => {
        const result = toCanonicalColumn(column, table);
        result.primaryKey = primary.columns.includes(column.name);
        if (result.primaryKey) result.nullable = false;
        if (result.type === "enum") {
          if (!column.enumValues?.length)
            throw new Error(
              `Enum values missing for ${table.schema}.${table.name}.${column.name}`
            );
          const key = JSON.stringify([result.enumSchema, result.enumName]);
          const definition = {
            name: result.enumName!,
            schema: result.enumSchema!,
            values: [...column.enumValues],
          };
          const previous = enums.get(key);
          if (
            previous &&
            JSON.stringify(previous.values) !==
              JSON.stringify(definition.values)
          )
            throw new Error("Conflicting introspected enum definitions");
          enums.set(key, definition);
        }
        return result;
      });
      return {
        checks: structuredClone(table.checks ?? []),
        columns,
        foreignKeys: table.foreignKeys.map((fk) => ({
          cardinality: "one-to-many" as const,
          columns: [...fk.columns],
          name: fk.name ?? null,
          onDelete: normalizeAction(fk.onDelete),
          onUpdate: normalizeAction(fk.onUpdate),
          refColumns: [...fk.refColumns],
          refTable: {
            schema: fk.refSchema ?? table.schema,
            table: fk.refTable,
          },
        })),
        indexes: table.indexes
          .filter((idx) => !idx.unique)
          .map((idx) => ({
            columns: [...idx.columns],
            elements: structuredClone(
              idx.elements ??
                idx.columns.map((value) => ({ kind: "column" as const, value }))
            ),
            name: idx.name,
            type: idx.type ?? "btree",
          })),
        name: table.name,
        primaryKey: primary.columns.length
          ? {
              columns: [...primary.columns],
              name: primary.name,
              source: "index" as const,
            }
          : undefined,
        schema: table.schema,
        uniqueConstraints: table.indexes
          .filter((idx) => idx.unique)
          .map((idx) => ({
            columns: [...idx.columns],
            elements: structuredClone(
              idx.elements ??
                idx.columns.map((value) => ({ kind: "column" as const, value }))
            ),
            name: idx.name,
            type: idx.type ?? "btree",
          })),
      };
    })
    .sort((a, b) =>
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)
    );
  const metadata: CanonicalSchema = {
    databaseType: database.dialect === "postgres" ? "PostgreSQL" : "MySQL",
    dialect: database.dialect,
    enums: [...enums.values()].sort((a, b) =>
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)
    ),
    tables,
  };
  // Normalize through the same DBML contract as repository and editor inputs.
  // This supplies canonical null/default/source conventions and exact literals.
  return normalize(parseDbml(renderDbml(metadata))).schema;
}

function normalizeAction(
  action: string | null
): "cascade" | "restrict" | "set null" | "set default" | "no action" | "none" {
  const value = (action ?? "").trim().toLowerCase();
  if (value === "cascade") return "cascade";
  if (value === "restrict") return "restrict";
  if (value === "set null") return "set null";
  if (value === "set default") return "set default";
  if (value === "no action") return "no action";
  return "none";
}

export interface CapabilityReport {
  columns: number;
  dialect: IntrospectedDialect;
  enumColumns: number;
  tables: number;
  unsupported: Array<{ column: string; table: string; type: string }>;
}

/** Capability matrix input for deciding whether a dialect is fully supported. */
export function assessDatabaseCapabilities(
  database: IntrospectedDatabase
): CapabilityReport {
  const unsupported: CapabilityReport["unsupported"] = [];
  let columns = 0;
  let enumColumns = 0;
  for (const table of database.tables) {
    for (const column of table.columns) {
      columns += 1;
      const mapping: TypeMapping = column.enumValues
        ? { type: "enum" as const }
        : mapNativeType(column.nativeType);
      if (mapping.type === "enum") enumColumns += 1;
      if (mapping.type === "unsupported") {
        unsupported.push({
          column: column.name,
          table: table.name,
          type: column.nativeType,
        });
      }
    }
  }
  return {
    columns,
    dialect: database.dialect,
    enumColumns,
    tables: database.tables.length,
    unsupported,
  };
}
