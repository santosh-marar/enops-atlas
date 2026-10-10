//
// types.ts — Complete ParsedSchema
// Based on real @dbml/core v8.2.5 output inspection.
// Use dbmlv2 parser to unlock: checks, TablePartial, records.
//
// NAMING NOTE: this used to be called "NormalizedSchema", which was
// misleading — nothing here is neutral/vendor-agnostic. This is just a
// stable, TypeScript-typed copy of exactly what the DBML text said,
// safely insulated from @dbml/core's unstable internal AST. Neutrality
// happens one step later, in canonical/normalize.ts → CanonicalSchema.

//  primitives

export type DefaultType =
  | "string"
  | "number"
  | "boolean"
  | "expression"
  | "null";

export interface ColumnDefault {
  /** Exact source spelling for numeric literals; never reconstructed from a float. */
  literal?: string;
  type: DefaultType;
  value: string | number | boolean | null;
}

export type RefAction =
  | "cascade"
  | "restrict"
  | "set null"
  | "set default"
  | "no action"
  | "none";

export type Cardinality = "one-to-one" | "one-to-many" | "many-to-many";

export type IndexType =
  | "brin"
  | "btree"
  | "gin"
  | "gist"
  | "hash"
  | "spgist"
  | null;

//  check constraint

export interface CheckSchema {
  column: string | null;
  expression: string;
  name: string | null;
}

//  column

export interface ColumnSchema {
  checks: CheckSchema[];
  default: ColumnDefault | null;
  enumRef: string | null;
  enumSchema?: string;
  increment: boolean;
  name: string;
  note: string | null;
  nullable: boolean;
  primaryKey: boolean;
  type: string;
  typeArgs: string | null;
  unique: boolean;
}

//  index

export interface IndexSchema {
  columns: string[];
  elements?: IndexElement[];
  name: string | null;
  note: string | null;
  pk: boolean;
  type: IndexType;
  unique: boolean;
}

export interface IndexElement {
  kind: "column" | "expression";
  value: string;
}

export type SchemaDialect =
  | "postgres"
  | "mysql"
  | "mssql"
  | "sqlite"
  | "oracle"
  | "snowflake"
  | "unknown";

//  table

export interface TableSchema {
  alias?: string;
  checks: CheckSchema[];
  columns: ColumnSchema[];
  fullName: string;
  indexes: IndexSchema[];
  name: string;
  note: string | null;
  records: RecordSchema | null;
  schema: string;
}

//  records (seed data)

export interface RecordValueSchema {
  type: string;
  value: string | number | boolean | null;
}

export interface RecordSchema {
  columns: string[];
  rows: RecordValueSchema[][];
}

//  relationship

export interface RelationshipSchema {
  cardinality: Cardinality;
  from: {
    schema: string;
    table: string;
    columns: string[];
  };
  name?: string | null;
  onDelete: RefAction;
  onUpdate: RefAction;
  to: {
    schema: string;
    table: string;
    columns: string[];
  };
}

//  enum

export interface EnumValueSchema {
  name: string;
  note: string | null;
}

export interface EnumSchema {
  name: string;
  note: string | null;
  schema: string;
  values: EnumValueSchema[];
}

//  root

export interface ParsedSchema {
  databaseType?: string;
  dialect?: SchemaDialect;
  enums: Map<string, EnumSchema>;
  raw: string;
  relationships: RelationshipSchema[];
  tables: Map<string, TableSchema>;
}

/**
 * Legacy name for ParsedSchema — kept as an alias because much of the
 * pipeline (validator, merger, generators, AI workflow) still imports
 * this name from this module.
 */
export type NormalizedSchema = ParsedSchema;
