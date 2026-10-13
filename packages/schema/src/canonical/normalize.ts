import type { IndexType, ParsedSchema, TableSchema } from "../dbml/types";
import type {
  CanonicalColumn,
  CanonicalEnum,
  CanonicalForeignKey,
  CanonicalIndex,
  CanonicalPrimaryKey,
  CanonicalTable,
  CanonicalType,
  CanonicalUniqueConstraint,
  NormalizeError,
  NormalizeResult,
} from "./types";

//  type map
const TYPE_MAP: Record<string, CanonicalType> = {
  bigint: "bigint",
  bool: "boolean",
  boolean: "boolean",
  char: "string",
  character: "string",
  "character varying": "string",
  date: "date",
  datetime: "timestamp",
  decimal: "decimal",
  "double precision": "float",
  float: "float",
  float4: "float",
  float8: "float",
  int: "int",
  int2: "int",
  int4: "int",
  int8: "bigint",
  integer: "int",
  json: "json",
  jsonb: "json",
  numeric: "decimal",
  real: "float",
  smallint: "int",
  text: "text",
  timestamp: "timestamp",
  "timestamp with time zone": "timestamp",
  "timestamp without time zone": "timestamp",
  timestamptz: "timestamp",
  uuid: "uuid",
  varchar: "string",
};

//  type resolution
function resolveType(
  rawType: string,
  rawTypeArgs: string | null
): Pick<
  CanonicalColumn,
  "type" | "length" | "precision" | "arrayDimensions"
> | null {
  // An array resolves as its element type, with the dimensions kept.
  const array = rawType.trim().match(/^(.*?)((?:\[\d*\])+)$/);
  if (array?.[1] && array[2]) {
    const element = resolveType(array[1].trim(), rawTypeArgs);
    if (!element || element.arrayDimensions) return null;
    return { ...element, arrayDimensions: array[2].split("[").length - 1 };
  }
  let typeName = rawType;
  let typeArgs = rawTypeArgs;
  const embedded = rawType.match(/^([a-zA-Z_ ]+)\(([^)]+)\)(.*)$/);
  if (embedded !== null) {
    typeName = `${embedded[1]}${embedded[3]}`.trim();
    typeArgs = rawTypeArgs ?? (embedded[2] as string).trim();
  }

  const canonical = TYPE_MAP[typeName.toLowerCase()];
  if (!canonical) return null;

  if (canonical === "string" && typeArgs) {
    const n = Number(typeArgs);
    return { length: Number.isFinite(n) ? n : undefined, type: canonical };
  }
  if (canonical === "decimal" && typeArgs) {
    const [p, s] = typeArgs.split(",").map((x) => Number(x.trim()));
    if (
      p !== undefined &&
      s !== undefined &&
      Number.isFinite(p) &&
      Number.isFinite(s)
    ) {
      return { precision: [p, s], type: canonical };
    }
  }
  return { type: canonical };
}

//  column
function normalizeColumn(
  table: TableSchema,
  col: TableSchema["columns"][number],
  errors: NormalizeError[]
): CanonicalColumn {
  const common = {
    checks: structuredClone(col.checks),
    nativeType: { args: col.typeArgs, name: col.type },
    note: col.note,
  };
  if (col.enumRef) {
    return {
      ...common,
      autoIncrement: col.increment,
      enumName: col.enumRef,
      enumSchema: col.enumSchema ?? "public",
      name: col.name,
      nullable: col.nullable,
      primaryKey: col.primaryKey,
      type: "enum",
      unique: col.unique,
      ...(col.default ? { default: col.default } : {}),
    };
  }

  const resolved = resolveType(col.type, col.typeArgs);
  if (!resolved) {
    errors.push({
      code: "UNSUPPORTED_TYPE",
      column: col.name,
      message: `Column "${table.fullName}.${col.name}" has unsupported type "${col.type}".`,
      table: table.fullName,
    });
  }

  return {
    ...common,
    name: col.name,
    ...(resolved ?? { type: "unsupported" as const }),
    autoIncrement: col.increment,
    nullable: col.nullable,
    primaryKey: col.primaryKey,
    unique: col.unique,
    ...(col.default ? { default: col.default } : {}),
  };
}

//  primary key
function buildPrimaryKey(table: TableSchema): CanonicalPrimaryKey | undefined {
  const pkColumns = table.columns
    .filter((c) => c.primaryKey)
    .map((c) => c.name);
  if (pkColumns.length) return { columns: pkColumns, source: "column" };

  const pkIndex = table.indexes.find((i) => i.pk);
  if (pkIndex)
    return {
      columns: [...pkIndex.columns],
      name: pkIndex.name,
      note: pkIndex.note,
      source: "index",
    };
}

//  unique constraints
function buildUniqueConstraints(
  table: TableSchema
): CanonicalUniqueConstraint[] {
  return table.indexes
    .filter((idx) => idx.unique && !idx.pk)
    .map((idx) => ({
      columns: [...idx.columns],
      elements: structuredClone(
        idx.elements ??
          idx.columns.map((value) => ({ kind: "column" as const, value }))
      ),
      name: idx.name,
      note: idx.note,
      type: canonicalIndexType(idx.type),
    }));
}

//  indexes

/** Preserve the source index method across the canonical boundary. */
function canonicalIndexType(type: IndexType): CanonicalIndex["type"] {
  return type;
}

function buildIndexes(table: TableSchema): CanonicalIndex[] {
  return table.indexes
    .filter((idx) => !(idx.pk || idx.unique))
    .map((idx) => ({
      columns: [...idx.columns],
      elements: structuredClone(
        idx.elements ??
          idx.columns.map((value) => ({ kind: "column" as const, value }))
      ),
      name: idx.name ?? null,
      note: idx.note,
      type: canonicalIndexType(idx.type),
    }));
}

//  main

export function normalize(schema: ParsedSchema): NormalizeResult {
  const errors: NormalizeError[] = [];

  const tables: CanonicalTable[] = [];
  for (const [, table] of schema.tables) {
    if (table.records)
      errors.push({
        code: "UNSUPPORTED_RECORDS",
        column: "",
        message:
          "Seed records are retained in original DBML but require a separate lossless data adapter",
        table: table.fullName,
      });
    const columns = table.columns.map((c) => normalizeColumn(table, c, errors));

    const foreignKeys: CanonicalForeignKey[] = schema.relationships
      .filter((r) => `${r.from.schema}.${r.from.table}` === table.fullName)
      .map((r) => ({
        cardinality: r.cardinality,
        columns: r.from.columns,
        name: r.name ?? null,
        onDelete: r.onDelete,
        onUpdate: r.onUpdate,
        refColumns: r.to.columns,
        refTable: { schema: r.to.schema, table: r.to.table },
      }));

    tables.push({
      checks: structuredClone(table.checks),
      columns,
      foreignKeys,
      indexes: buildIndexes(table),
      name: table.name,
      note: table.note,
      primaryKey: buildPrimaryKey(table),
      records: structuredClone(table.records),
      schema: table.schema,
      uniqueConstraints: buildUniqueConstraints(table),
    });
  }

  const enums: CanonicalEnum[] = [];
  for (const [, en] of schema.enums) {
    enums.push({
      name: en.name,
      note: en.note,
      schema: en.schema,
      valueNotes: Object.fromEntries(en.values.map((v) => [v.name, v.note])),
      values: en.values.map((v) => v.name),
    });
  }

  return {
    errors,
    schema: {
      dialect: schema.dialect ?? "unknown",
      version: 2,
      ...(schema.databaseType ? { databaseType: schema.databaseType } : {}),
      enums,
      tables,
    },
  };
}
