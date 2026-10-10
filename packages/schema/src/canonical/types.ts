// canonical/types.ts
//
// ParsedSchema (dbml/types.ts) stores column types as raw strings
// straight from whatever produced it. That's fine for storage/diffing/sync,
// but generators need a closed type system: "varchar", "VARCHAR", and
// "character varying" are three strings that mean one thing.
//
// CanonicalSchema is the single IR all generators AND graph/LLM-reasoning
// consumers read. It sits after ParsedSchema in the pipeline and is plain
// serializable data — no class methods, BullMQ-safe, JSON-serializable.
//
// v2 retains native storage semantics alongside the logical type used by
// graph/reasoning consumers. A logical type alone is NEVER an export recipe.
import type {
  CheckSchema,
  IndexElement,
  IndexType,
  RecordSchema,
  SchemaDialect,
} from "../dbml/types";

//  type system

export type CanonicalType =
  | "uuid"
  | "string" // bounded text  — varchar/char
  | "text" // unbounded text
  | "int"
  | "bigint"
  | "float"
  | "decimal"
  | "boolean"
  | "json"
  | "date"
  | "timestamp"
  | "enum"
  | "unsupported"; // retained, with diagnostics; never dropped or guessed

/** Referential action on a FK. 'none' = clause not written in DBML. */
export type RefAction =
  | "cascade"
  | "restrict"
  | "set null"
  | "set default"
  | "no action"
  | "none";

export type DefaultType =
  | "string"
  | "number"
  | "boolean"
  | "expression"
  | "null";

export interface ColumnDefault {
  literal?: string;
  type: DefaultType;
  value: string | number | boolean | null;
}

//  column

export interface CanonicalColumn {
  /**
   * Auto-increment / SERIAL / IDENTITY. Renamed from ParsedSchema's
   * "increment" for clarity at this layer — same underlying fact.
   */
  autoIncrement: boolean;
  checks?: CheckSchema[];
  /** Column default value, if any. Carried through from ParsedSchema unchanged. */
  default?: ColumnDefault;
  /** Set only when type === "enum" — the enum's bare name e.g. "order_status" */
  enumName?: string;
  enumSchema?: string;
  /** String length e.g. 255 for varchar(255). Only set when type === "string". */
  length?: number;
  name: string;
  nativeType?: { name: string; args: string | null };
  note?: string | null;
  nullable: boolean;
  /** Decimal precision e.g. [10, 2] for decimal(10,2). Only set when type === "decimal". */
  precision?: [number, number];
  primaryKey: boolean;
  type: CanonicalType;
  unique: boolean; // column-level unique constraint
}

//  constraints & indexes

export interface CanonicalPrimaryKey {
  /** Ordered list of column names. Single-column PKs are [colName]. */
  columns: string[];
  name?: string | null;
  note?: string | null;
  /** Retain whether the key was declared in the indexes block. */
  source?: "column" | "index";
}

export interface CanonicalUniqueConstraint {
  columns: string[];
  elements?: IndexElement[];
  /** Deterministic name derived from table + columns. */
  name: string | null;
  note?: string | null;
  type?: IndexType;
}

export interface CanonicalIndex {
  columns: string[];
  elements?: IndexElement[];
  /** null when DBML didn't name it — generators derive one deterministically. */
  name: string | null;
  note?: string | null;
  type: IndexType;
}

/** Schema-qualified table reference, matching CanonicalTable's own shape — never a concatenated string. */
export interface TableRef {
  schema: string;
  table: string;
}

export interface CanonicalForeignKey {
  cardinality: "one-to-one" | "one-to-many" | "many-to-many";
  columns: string[];
  name?: string | null;
  /** What happens to this row when the referenced row is deleted. 'none' = not specified in DBML. */
  onDelete: RefAction;
  /** What happens to this row when the referenced row's key is updated. 'none' = not specified in DBML. */
  onUpdate: RefAction;
  refColumns: string[];
  /** Structured reference, not a concatenated "schema.table" string — matches CanonicalTable's own {schema, name} shape. */
  refTable: TableRef;
}

//  table

export interface CanonicalTable {
  checks?: CheckSchema[];
  columns: CanonicalColumn[];
  foreignKeys: CanonicalForeignKey[];
  /** Non-PK, non-unique indexes for query performance. */
  indexes: CanonicalIndex[];
  name: string;
  note?: string | null;
  primaryKey?: CanonicalPrimaryKey;
  records?: RecordSchema | null;
  schema: string;
  /** Multi-column unique constraints from indexes { (a,b) [unique] } blocks.
   *  Single-column uniqueness lives on CanonicalColumn.unique instead. */
  uniqueConstraints: CanonicalUniqueConstraint[];
}

//  enum

export interface CanonicalEnum {
  name: string;
  note?: string | null;
  schema: string;
  valueNotes?: Record<string, string | null>;
  values: string[];
}

//  root

export interface CanonicalSchema {
  databaseType?: string;
  dialect?: SchemaDialect;
  enums: CanonicalEnum[];
  tables: CanonicalTable[];
  /** Absent only in legacy in-memory fixtures. New normalizations emit v2. */
  version?: 2;
}

//  normalization result

export interface NormalizeError {
  code: "UNSUPPORTED_TYPE" | "UNSUPPORTED_RECORDS";
  column: string;
  message: string;
  table: string;
}

export interface NormalizeResult {
  errors: NormalizeError[];
  schema: CanonicalSchema;
}
