import { canonicalDigest } from "../canonical/compare";
import { normalize } from "../canonical/normalize";
import type {
  CanonicalColumn,
  CanonicalForeignKey,
  CanonicalSchema,
  CanonicalTable,
  ColumnDefault,
} from "../canonical/types";
import { validateCanonicalStructure } from "../canonical/validate";
import { quoteExpression, quoteName, quoteString } from "./literals";
import { parseDbml } from "./parse";
import type { IndexElement } from "./types";

const TYPE_TO_DBML = {
  bigint: "bigint",
  boolean: "boolean",
  date: "date",
  decimal: "decimal",
  float: "float",
  int: "int",
  json: "json",
  string: "varchar",
  text: "text",
  timestamp: "timestamp",
  uuid: "uuid",
} as const;
function qname(schema: string, name: string): string {
  return schema && schema !== "public"
    ? `${quoteName(schema)}.${quoteName(name)}`
    : quoteName(name);
}
function renderColumnType(c: CanonicalColumn): string {
  if (c.type === "enum") {
    if (!c.enumName) throw new Error("Enum column is missing its identity");
    return qname(c.enumSchema ?? "public", c.enumName);
  }
  if (c.nativeType) {
    let value = c.nativeType.name;
    if (c.nativeType.args && !value.includes("("))
      value += `(${c.nativeType.args})`;
    return /^[A-Za-z_][A-Za-z0-9_]*(\([^)]*\))?$/.test(value)
      ? value
      : quoteString(value);
  }
  if (c.type === "unsupported")
    throw new Error("Unsupported type has no preserved native representation");
  if (c.type === "string" && c.length) return `varchar(${c.length})`;
  if (c.type === "decimal" && c.precision)
    return `decimal(${c.precision.join(",")})`;
  return TYPE_TO_DBML[c.type];
}
function renderDefault(d: ColumnDefault): string {
  if (d.type === "expression")
    return `default: ${quoteExpression(String(d.value))}`;
  if (d.type === "string") return `default: ${quoteString(String(d.value))}`;
  if (d.type === "null") return "default: null";
  if (d.type === "number") {
    const value = d.literal ?? String(d.value);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
      throw new Error("Invalid numeric default");
    if (
      !d.literal &&
      typeof d.value === "number" &&
      (!Number.isFinite(d.value) ||
        (Number.isInteger(d.value) && !Number.isSafeInteger(d.value)))
    )
      throw new Error("Numeric default has already lost precision");
    return `default: ${value}`;
  }
  return `default: ${d.value === true ? "true" : "false"}`;
}
function renderColumn(c: CanonicalColumn, indexedPk: boolean): string {
  const settings: string[] = [];
  if (c.primaryKey && !indexedPk) settings.push("pk");
  if (!c.nullable) settings.push("not null");
  if (c.unique) settings.push("unique");
  if (c.autoIncrement) settings.push("increment");
  if (c.default) settings.push(renderDefault(c.default));
  if (c.note !== null && c.note !== undefined)
    settings.push(`note: ${quoteString(c.note)}`);
  for (const check of c.checks ?? []) {
    if (check.name)
      throw new Error(
        "Named column checks require an explicit table-check representation"
      );
    settings.push(`check: ${quoteExpression(check.expression)}`);
  }
  return `  ${quoteName(c.name)} ${renderColumnType(c)}${settings.length ? ` [${settings.join(", ")}]` : ""}`;
}
function indexFields(columns: string[], elements?: IndexElement[]): string {
  const values =
    elements ?? columns.map((value) => ({ kind: "column" as const, value }));
  return `(${values.map((e) => (e.kind === "expression" ? quoteExpression(e.value) : quoteName(e.value))).join(", ")})`;
}
function renderTable(t: CanonicalTable): string {
  if (t.records)
    throw new Error(
      "Seed records are retained in source but are not supported by the schema renderer"
    );
  const indexedPk =
    t.primaryKey?.source === "index" || (t.primaryKey?.columns.length ?? 0) > 1;
  const body = t.columns.map((c) => renderColumn(c, indexedPk));
  const entries: string[] = [];
  if (t.primaryKey && indexedPk) {
    const attrs = ["pk"];
    if (t.primaryKey.name)
      attrs.push(`name: ${quoteString(t.primaryKey.name)}`);
    if (t.primaryKey.note !== null && t.primaryKey.note !== undefined)
      attrs.push(`note: ${quoteString(t.primaryKey.note)}`);
    entries.push(
      `    ${indexFields(t.primaryKey.columns)} [${attrs.join(", ")}]`
    );
  }
  for (const [index, unique] of [
    ...t.uniqueConstraints.map((i) => [i, true] as const),
    ...t.indexes.map((i) => [i, false] as const),
  ]) {
    const attrs: string[] = unique ? ["unique"] : [];
    if (index.name) attrs.push(`name: ${quoteString(index.name)}`);
    if (index.type) attrs.push(`type: ${index.type}`);
    if (index.note !== null && index.note !== undefined)
      attrs.push(`note: ${quoteString(index.note)}`);
    entries.push(
      `    ${indexFields(index.columns, index.elements)}${attrs.length ? ` [${attrs.join(", ")}]` : ""}`
    );
  }
  if (entries.length) body.push(`  indexes {\n${entries.join("\n")}\n  }`);
  if (t.checks?.length)
    body.push(
      `  checks {\n${t.checks.map((c) => `    ${quoteExpression(c.expression)}${c.name ? ` [name: ${quoteString(c.name)}]` : ""}`).join("\n")}\n  }`
    );
  if (t.note !== null && t.note !== undefined)
    body.push(`  Note: ${quoteString(t.note)}`);
  return `Table ${qname(t.schema, t.name)} {\n${body.join("\n")}\n}`;
}
function renderRef(t: CanonicalTable, fk: CanonicalForeignKey): string {
  const endpoint = (schema: string, name: string, columns: string[]) =>
    `${qname(schema, name)}.${columns.length === 1 ? quoteName(columns[0]!) : `(${columns.map(quoteName).join(", ")})`}`;
  const from = endpoint(t.schema, t.name, fk.columns),
    to = endpoint(fk.refTable.schema, fk.refTable.table, fk.refColumns);
  const relation =
    fk.cardinality === "one-to-one"
      ? `${to} - ${from}`
      : `${from} ${fk.cardinality === "many-to-many" ? "<>" : ">"} ${to}`;
  const actions: string[] = [];
  if (fk.onDelete !== "none") actions.push(`delete: ${fk.onDelete}`);
  if (fk.onUpdate !== "none") actions.push(`update: ${fk.onUpdate}`);
  return `Ref${fk.name ? ` ${quoteName(fk.name)}` : ""}: ${relation}${actions.length ? ` [${actions.join(", ")}]` : ""}`;
}
/** Same-dialect DBML serialization, not a database/ORM migration translator.
 * Reparse before returning; the checked export API also proves semantic equality.
 */
export function renderDbml(schema: CanonicalSchema): string {
  if (schema.version !== undefined && schema.version !== 2)
    throw new Error("Unsupported canonical schema version");
  const issues = validateCanonicalStructure(schema);
  if (issues.length)
    throw new Error(
      `Invalid canonical schema: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`
    );
  const blocks: string[] = [];
  if (schema.databaseType)
    blocks.push(
      `Project schema_model {\n  database_type: ${quoteString(schema.databaseType)}\n}`
    );
  for (const en of schema.enums) {
    const values = en.values.map((v) => {
      const note = en.valueNotes?.[v] ?? null;
      return `  ${quoteName(v)}${note === null ? "" : ` [note: ${quoteString(note)}]`}`;
    });
    if (en.note !== null && en.note !== undefined)
      values.push(`  Note: ${quoteString(en.note)}`);
    blocks.push(`Enum ${qname(en.schema, en.name)} {\n${values.join("\n")}\n}`);
  }
  blocks.push(...schema.tables.map(renderTable));
  blocks.push(
    ...schema.tables.flatMap((t) => t.foreignKeys.map((fk) => renderRef(t, fk)))
  );
  const output = `${blocks.join("\n\n")}\n`;
  const reparsed = parseDbml(output);
  if (
    schema.version === 2 &&
    canonicalDigest(normalize(reparsed).schema) !== canonicalDigest(schema)
  )
    throw new Error(
      "DBML round-trip changed canonical schema semantics; export refused"
    );
  return output;
}
