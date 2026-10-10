import type { CanonicalSchema } from "./types";

export type CanonicalIssue = {
  code: "INVALID_STRUCTURE";
  path: string;
  message: string;
};

/** Structural integrity, separate from Atlas's opinionated generation rules.
 * Cycles and tables without primary keys are not universally invalid SQL.
 * Engine-specific type compatibility and migration safety belong to adapters.
 */
export function validateCanonicalStructure(
  schema: CanonicalSchema
): CanonicalIssue[] {
  const issues: CanonicalIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ code: "INVALID_STRUCTURE", message, path });
  const key = (space: string, name: string) => JSON.stringify([space, name]);
  const tables = new Map(schema.tables.map((t) => [key(t.schema, t.name), t]));
  if (tables.size !== schema.tables.length)
    error("tables", "Duplicate table identity");
  const enums = new Set(schema.enums.map((e) => key(e.schema, e.name)));
  if (enums.size !== schema.enums.length)
    error("enums", "Duplicate enum identity");
  for (const en of schema.enums)
    if (new Set(en.values).size !== en.values.length)
      error(`${en.schema}.${en.name}`, "Duplicate enum values");
  for (const t of schema.tables) {
    const path = `${t.schema}.${t.name}`;
    const columns = new Set(t.columns.map((c) => c.name));
    if (columns.size !== t.columns.length) error(path, "Duplicate column name");
    const requireColumns = (names: string[], at: string) => {
      if (!names.length) error(at, "Empty constraint column list");
      for (const name of names)
        if (!columns.has(name)) error(at, `Unknown column ${name}`);
    };
    if (t.primaryKey)
      requireColumns(t.primaryKey.columns, path + ".primaryKey");
    for (const c of t.columns) {
      if (
        c.type === "enum" &&
        !(c.enumName && enums.has(key(c.enumSchema ?? "public", c.enumName)))
      )
        error(path + "." + c.name, "Unknown or ambiguous enum identity");
      if (c.nativeType && !c.nativeType.name.trim())
        error(path + "." + c.name, "Empty native type");
    }
    for (const idx of [...t.indexes, ...t.uniqueConstraints]) {
      const elements =
        idx.elements ?? idx.columns.map((value) => ({ kind: "column", value }));
      if (
        elements.length !== idx.columns.length ||
        elements.some((e, i) => e.value !== idx.columns[i])
      )
        error(
          path + ".indexes",
          "Index elements and compatibility column list disagree"
        );
      if (!elements.length) error(path + ".indexes", "Empty index");
      for (const e of elements)
        if (e.kind === "column") requireColumns([e.value], path + ".indexes");
        else if (!e.value.trim())
          error(path + ".indexes", "Empty index expression");
    }
    for (const fk of t.foreignKeys) {
      requireColumns(fk.columns, path + ".foreignKeys");
      const target = tables.get(key(fk.refTable.schema, fk.refTable.table));
      if (target) {
        for (const name of fk.refColumns) {
          if (!target.columns.some((c) => c.name === name)) {
            error(path + ".foreignKeys", `Unknown referenced column ${name}`);
          }
        }
      } else {
        error(path + ".foreignKeys", "Unknown referenced table");
      }
      if (!fk.refColumns.length || fk.refColumns.length !== fk.columns.length)
        error(path + ".foreignKeys", "Mismatched foreign key arity");
    }
  }
  return issues;
}
