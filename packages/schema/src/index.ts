// The shared schema IR: canonical types, DBML parse/render, normalization,
// validation, and diffs. Framework-independent and browser-safe.

export * from "./canonical/compare";
export * from "./canonical/diff";
export * from "./canonical/export";
export * from "./canonical/normalize";
export * from "./canonical/types";
export * from "./canonical/validate";
export {
  numericDefaultLiteral,
  quoteExpression,
  quoteName,
  quoteString,
} from "./dbml/literals";
export { parseDbml, resolveDirection } from "./dbml/parse";
export { renderDbml } from "./dbml/render";
export type {
  Cardinality,
  CheckSchema,
  ColumnDefault as DbmlColumnDefault,
  ColumnSchema,
  DefaultType as DbmlDefaultType,
  EnumSchema,
  EnumValueSchema,
  IndexElement,
  IndexSchema,
  IndexType,
  NormalizedSchema,
  ParsedSchema,
  RecordSchema,
  RecordValueSchema,
  RefAction as DbmlRefAction,
  RelationshipSchema,
  SchemaDialect,
  TableSchema,
} from "./dbml/types";
export * from "./hash";
export {
  dbmlToSql,
  type SqlExportDialect,
  type SqlImportDialect,
  sqlToDbml,
} from "./sql";
