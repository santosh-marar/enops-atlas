import type { CanonicalColumn, IndexElement } from "@enops/atlas-schema";
import type { SchemaGraph } from "./types";

function exactDefault(column: CanonicalColumn): string | null {
  if (!column.default) return null;
  const value =
    column.default.literal ??
    (column.default.type === "string"
      ? JSON.stringify(column.default.value)
      : String(column.default.value));
  return `default(${column.default.type}:${value})`;
}

function formatColumn(column: CanonicalColumn): string {
  const logical =
    column.type === "enum"
      ? `enum(${column.enumSchema ?? "public"}.${column.enumName})`
      : column.type;
  const parts = [column.name, logical];
  if (column.nativeType)
    parts.push(
      `native(${column.nativeType.name}${column.nativeType.args && !column.nativeType.name.includes("(") ? `(${column.nativeType.args})` : ""})`
    );
  if (column.length) parts.push(`length(${column.length})`);
  if (column.precision) parts.push(`precision(${column.precision.join(",")})`);
  const flags = [
    column.primaryKey ? "pk" : null,
    column.unique ? "unique" : null,
    column.nullable ? "nullable" : "not null",
    column.autoIncrement ? "auto" : null,
    exactDefault(column),
    ...(column.checks ?? []).map(
      (check) =>
        `check${check.name ? ` ${JSON.stringify(check.name)}` : ""}(${check.expression})`
    ),
    column.note ? `note(${JSON.stringify(column.note)})` : null,
  ].filter(Boolean);
  return `${parts.join(" ")} ${flags.join(" ")}`.trim();
}

function elementText(element: IndexElement): string {
  return element.kind === "expression"
    ? `expression(${element.value})`
    : element.value;
}

function elementsText(
  elements: IndexElement[] | undefined,
  columns: string[]
): string {
  return (elements?.length ? elements.map(elementText) : columns).join(",");
}

const CARDINALITY_LABEL: Record<string, string> = {
  "many-to-many": "has many (through join)",
  "one-to-many": "has many",
  "one-to-one": "has one",
};

/** Serializes scoped v2 logical and physical facts for reasoning. */
export function serializeNeighborhood(
  graph: SchemaGraph,
  tableKeys: Set<string>
): string {
  const lines: string[] = [
    `schema canonical=${graph.version ? `v${graph.version}` : "legacy"} dialect=${graph.dialect}${graph.databaseType ? ` database_type=${JSON.stringify(graph.databaseType)}` : ""}`,
  ];
  const sorted = [...tableKeys].sort();
  const enumKeys = new Set<string>();
  for (const key of sorted) {
    const node = graph.nodes.get(key);
    if (!node) continue;
    for (const column of node.columns)
      if (column.type === "enum" && column.enumName)
        enumKeys.add(`${column.enumSchema ?? "public"}.${column.enumName}`);
  }
  for (const value of [...graph.enums]
    .filter((entry) => enumKeys.has(`${entry.schema}.${entry.name}`))
    .sort((a, b) => {
      const left = `${a.schema}.${a.name}`;
      const right = `${b.schema}.${b.name}`;
      return left < right ? -1 : left > right ? 1 : 0;
    }))
    lines.push(
      `enum ${value.schema}.${value.name} = ${value.values
        .map(
          (entry) =>
            `${JSON.stringify(entry)}${value.valueNotes?.[entry] ? ` note(${JSON.stringify(value.valueNotes[entry])})` : ""}`
        )
        .join(
          " | "
        )}${value.note ? ` note(${JSON.stringify(value.note)})` : ""}`
    );

  for (const key of sorted) {
    const node = graph.nodes.get(key);
    if (!node) continue;
    const { table, columns } = node;
    lines.push(
      `${node.key}${table.note ? ` note(${JSON.stringify(table.note)})` : ""}`
    );
    for (const column of columns)
      lines.push(`  column ${formatColumn(column)}`);
    if (table.primaryKey)
      lines.push(
        `  primary key${table.primaryKey.name ? ` ${JSON.stringify(table.primaryKey.name)}` : ""} (${table.primaryKey.columns.join(",")})${table.primaryKey.note ? ` note(${JSON.stringify(table.primaryKey.note)})` : ""}`
      );
    for (const unique of table.uniqueConstraints)
      lines.push(
        `  unique${unique.name ? ` ${JSON.stringify(unique.name)}` : ""} (${elementsText(unique.elements, unique.columns)})${unique.type ? ` using ${unique.type}` : ""}${unique.note ? ` note(${JSON.stringify(unique.note)})` : ""}`
      );
    for (const index of table.indexes)
      lines.push(
        `  index${index.name ? ` ${JSON.stringify(index.name)}` : ""} (${elementsText(index.elements, index.columns)})${index.type ? ` using ${index.type}` : ""}${index.note ? ` note(${JSON.stringify(index.note)})` : ""}`
      );
    for (const check of table.checks ?? [])
      lines.push(
        `  check${check.name ? ` ${JSON.stringify(check.name)}` : ""} (${check.expression})`
      );

    const outgoing = (graph.adjacency.get(key) ?? []).filter((edge) =>
      tableKeys.has(edge.to)
    );
    for (const edge of outgoing) {
      const label =
        CARDINALITY_LABEL[edge.fk.cardinality] ?? edge.fk.cardinality;
      const actions = [
        edge.fk.onDelete === "none" ? null : `on delete ${edge.fk.onDelete}`,
        edge.fk.onUpdate === "none" ? null : `on update ${edge.fk.onUpdate}`,
      ].filter(Boolean);
      lines.push(
        `  → ${label}${edge.fk.name ? ` ${JSON.stringify(edge.fk.name)}` : ""}: ${edge.to} via ${edge.fk.columns.join(",")} → ${edge.fk.refColumns.join(",")}${actions.length ? `, ${actions.join(", ")}` : ""}`
      );
    }
  }

  return lines.join("\n");
}
