import type {
  CanonicalColumn,
  CanonicalSchema,
  CanonicalTable,
} from "@enops/atlas-schema";
import { sha256Hex } from "@enops/atlas-schema";

// Canonical schema → retrieval chunks.
//
// Deterministic and browser-safe: schema vector search must work in Atlas
// Cloud without a Node runtime, and the same schema element must always
// produce the same chunk id so re-indexing is idempotent and unchanged
// elements can be copy-forwarded without re-embedding.
//
// Chunk ids are scoped by projectId but NOT by versionId: a project's
// `public.users` table keeps one stable id across versions, while the
// payload carries schemaVersionId for version isolation at query time.

export type SchemaChunkKind =
  | "table"
  | "column"
  | "relationship"
  | "enum"
  | "index"
  | "constraint";

export interface SchemaChunk {
  column?: string;
  enumName?: string;
  id: string;
  kind: SchemaChunkKind;
  /** Logical identity used for exact-name retrieval. */
  name: string;
  refColumn?: string;
  refTable?: string;
  schema: string;
  table?: string;
  /** Natural-language description used for embedding and display. */
  text: string;
}

export interface BuildSchemaChunksOptions {
  projectId?: string;
  schemaVersionId?: string;
}

function columnTypeText(column: CanonicalColumn): string {
  if (column.type === "string" && column.length)
    return `string(${column.length})`;
  if (column.type === "decimal" && column.precision) {
    return `decimal(${column.precision[0]},${column.precision[1]})`;
  }
  if (column.type === "enum" && column.enumName)
    return `enum ${column.enumName}`;
  if (column.type === "unsupported") {
    return column.nativeType
      ? `unsupported(${column.nativeType.name})`
      : "unsupported";
  }
  return column.type;
}

function columnDefaultText(column: CanonicalColumn): string | null {
  if (!column.default) return null;
  const { literal, value } = column.default;
  if (literal !== undefined) return literal;
  if (value === null) return "null";
  return String(value);
}

function tableQualified(table: CanonicalTable): string {
  return `${table.schema}.${table.name}`;
}

/** Builds a semantic description for a table, including its relationships. */
function tableText(table: CanonicalTable): string {
  const parts: string[] = [
    `Table ${tableQualified(table)} with ${table.columns.length} column${table.columns.length === 1 ? "" : "s"}.`,
  ];
  if (table.primaryKey?.columns.length) {
    parts.push(`Primary key: ${table.primaryKey.columns.join(", ")}.`);
  }
  if (table.foreignKeys.length) {
    parts.push(
      `Relationships: ${table.foreignKeys
        .map(
          (fk) =>
            `${fk.columns.join(", ")} -> ${fk.refTable.schema}.${fk.refTable.table}(${fk.refColumns.join(", ")}) [${fk.cardinality}]`
        )
        .join("; ")}.`
    );
  }
  if (table.note) parts.push(`Note: ${table.note}`);
  return parts.join(" ");
}

function columnText(table: CanonicalTable, column: CanonicalColumn): string {
  const flags: string[] = [column.nullable ? "nullable" : "not null"];
  if (column.primaryKey) flags.push("primary key");
  if (column.unique) flags.push("unique");
  if (column.autoIncrement) flags.push("auto increment");
  const defaultText = columnDefaultText(column);
  if (defaultText !== null) flags.push(`default ${defaultText}`);
  const note = column.note ? ` Note: ${column.note}.` : "";
  return `Column ${tableQualified(table)}.${column.name} of type ${columnTypeText(column)} (${flags.join(", ")}).${note}`;
}

function relationshipText(table: CanonicalTable): string[] {
  return table.foreignKeys.map((fk) => {
    const actions: string[] = [];
    if (fk.onDelete !== "none") actions.push(`on delete ${fk.onDelete}`);
    if (fk.onUpdate !== "none") actions.push(`on update ${fk.onUpdate}`);
    const suffix = actions.length ? ` ${actions.join(", ")}.` : "";
    return `Relationship ${tableQualified(table)}.${fk.columns.join(", ")} references ${fk.refTable.schema}.${fk.refTable.table}.${fk.refColumns.join(", ")} (${fk.cardinality}).${suffix}`;
  });
}

/**
 * Formats a deterministic RFC-4122-shaped UUID from a hash. Qdrant requires
 * UUID (or integer) point ids, so content-addressed chunk identities are
 * projected into UUID form here rather than stored as raw hex.
 */
function deterministicUuid(hex: string): string {
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = "8";
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

/** Builds every retrieval chunk for one canonical schema. */
export function buildSchemaChunks(
  schema: CanonicalSchema,
  options: BuildSchemaChunksOptions = {}
): SchemaChunk[] {
  const { projectId } = options;
  const chunks: SchemaChunk[] = [];

  const idFor = (kind: SchemaChunkKind, identity: string) =>
    deterministicUuid(sha256Hex(`${projectId ?? ""}::${kind}::${identity}`));

  for (const table of schema.tables) {
    const qualified = tableQualified(table);
    chunks.push({
      id: idFor("table", qualified),
      kind: "table",
      name: table.name,
      schema: table.schema,
      table: table.name,
      text: tableText(table),
    });

    for (const column of table.columns) {
      chunks.push({
        column: column.name,
        id: idFor("column", `${qualified}.${column.name}`),
        kind: "column",
        name: `${table.name}.${column.name}`,
        schema: table.schema,
        table: table.name,
        text: columnText(table, column),
      });
    }

    const relationTexts = relationshipText(table);
    table.foreignKeys.forEach((fk, index) => {
      chunks.push({
        id: idFor(
          "relationship",
          `${qualified}:${fk.columns.join(",")}->${fk.refTable.schema}.${fk.refTable.table}:${fk.refColumns.join(",")}`
        ),
        kind: "relationship",
        name: `${table.name}.${fk.columns.join(",")}`,
        refColumn: fk.refColumns.join(","),
        refTable: fk.refTable.table,
        schema: table.schema,
        table: table.name,
        text: relationTexts[index] ?? "",
      });
    });

    for (const tableIndex of table.indexes) {
      chunks.push({
        id: idFor(
          "index",
          `${qualified}:index:${tableIndex.name ?? tableIndex.columns.join(",")}`
        ),
        kind: "index",
        name:
          tableIndex.name ?? `${table.name}(${tableIndex.columns.join(",")})`,
        schema: table.schema,
        table: table.name,
        text: `Index ${tableIndex.name ?? "(unnamed)"} on ${qualified} (${tableIndex.columns.join(", ")})${tableIndex.type ? ` using ${tableIndex.type}` : ""}.`,
      });
    }

    for (const unique of table.uniqueConstraints) {
      chunks.push({
        id: idFor(
          "constraint",
          `${qualified}:unique:${unique.name ?? unique.columns.join(",")}`
        ),
        kind: "constraint",
        name: unique.name ?? `${table.name}(${unique.columns.join(",")})`,
        schema: table.schema,
        table: table.name,
        text: `Unique constraint ${unique.name ?? "(unnamed)"} on ${qualified} (${unique.columns.join(", ")}).`,
      });
    }
  }

  for (const item of schema.enums) {
    chunks.push({
      enumName: item.name,
      id: idFor("enum", `${item.schema}.${item.name}`),
      kind: "enum",
      name: item.name,
      schema: item.schema,
      text: `Enum ${item.schema}.${item.name} with values: ${item.values.join(", ")}.${item.note ? ` Note: ${item.note}` : ""}`,
    });
  }

  return chunks;
}
