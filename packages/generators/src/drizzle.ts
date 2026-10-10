import type { CanonicalColumn, CanonicalSchema } from "@enops/atlas-schema";
import {
  assertDistinct,
  assertSupported,
  identifier,
  identity,
  nativeParts,
} from "./capabilities";

const q = JSON.stringify;
const camel = (name: string) => identifier(name);

export function generateDrizzleSchema(schema: CanonicalSchema): string {
  assertSupported(schema, "drizzle");
  const imports = new Set<string>(["pgTable"]);
  const typeImports = new Set<string>();
  const usesSql = { value: false };
  const raw = (expression: string) => {
    usesSql.value = true;
    return `sql.raw(${q(expression)})`;
  };
  const spaces = [
    ...new Set([
      ...schema.tables.map((t) => t.schema),
      ...schema.enums.map((e) => e.schema),
    ]),
  ]
    .filter((s) => s !== "public")
    .sort();
  const spaceName = (space: string) => `${camel(space)}Schema`;
  const blocks: string[] = [];
  assertDistinct(
    [...schema.tables, ...schema.enums]
      .map((t) => identity(t.schema, t.name))
      .concat(spaces.map(spaceName)),
    "Drizzle tables, enums, and schemas"
  );
  if (spaces.length) imports.add("pgSchema");
  for (const space of spaces)
    blocks.push(`const ${spaceName(space)} = pgSchema(${q(space)});`);
  for (const en of schema.enums) {
    const builder =
      en.schema === "public" ? "pgEnum" : `${spaceName(en.schema)}.enum`;
    if (en.schema === "public") imports.add("pgEnum");
    blocks.push(
      `export const ${identity(en.schema, en.name)} = ${builder}(${q(en.name)}, ${q(en.values)});`
    );
  }
  const emitColumn = (c: CanonicalColumn, singlePk: boolean): string => {
    const { name, args } = nativeParts(c);
    let base: string;
    const call = (builder: string, options?: string) => {
      imports.add(builder);
      return `${builder}(${q(c.name)}${options ? `, ${options}` : ""})`;
    };
    switch (c.type) {
      case "uuid":
        base = call("uuid");
        break;
      case "string":
        base = ["char", "character"].includes(name)
          ? call("char", `{ length: ${args ?? c.length ?? 1} }`)
          : call(
              "varchar",
              args || c.length ? `{ length: ${args ?? c.length} }` : undefined
            );
        break;
      case "text":
        base = call("text");
        break;
      case "int":
        base = call(
          ["smallint", "int2"].includes(name) ? "smallint" : "integer"
        );
        break;
      case "bigint":
        base = call("bigint", '{ mode: "bigint" }');
        break;
      case "float":
        base = call(
          ["real", "float4"].includes(name) ||
            (name === "float" && args && Number(args) <= 24)
            ? "real"
            : "doublePrecision"
        );
        break;
      case "decimal":
        base = call(
          "numeric",
          c.precision
            ? `{ precision: ${c.precision[0]}, scale: ${c.precision[1]} }`
            : args
              ? `{ precision: ${args.split(",")[0]}, scale: ${args.split(",")[1] ?? 0} }`
              : undefined
        );
        break;
      case "boolean":
        base = call("boolean");
        break;
      case "json":
        base = call(name === "json" ? "json" : "jsonb");
        break;
      case "date":
        base = call("date");
        break;
      case "timestamp":
        base = call(
          "timestamp",
          `{ withTimezone: ${["timestamptz", "timestamp with time zone"].includes(name)}, mode: "string"${args ? `, precision: ${args}` : ""} }`
        );
        break;
      case "enum":
        base = `${identity(c.enumSchema ?? "public", c.enumName!)}(${q(c.name)})`;
        break;
      default:
        throw new Error(`Unsupported Drizzle type ${c.type}`);
    }
    if (c.autoIncrement) base += ".generatedByDefaultAsIdentity()";
    if (!c.nullable) base += ".notNull()";
    if (singlePk) base += ".primaryKey()";
    if (c.unique) base += ".unique()";
    if (c.default) {
      const d = c.default;
      if (d.type === "expression") base += `.default(${raw(String(d.value))})`;
      else if (d.type === "null") base += `.default(${raw("NULL")})`;
      else if (d.type === "number")
        base += `.default(${raw(d.literal ?? String(d.value))})`;
      else base += `.default(${q(d.value)})`;
    }
    return `${camel(c.name)}: ${base}`;
  };
  for (const table of schema.tables) {
    assertDistinct(
      table.columns.map((c) => camel(c.name)),
      "Drizzle columns"
    );
    const constraints: string[] = [];
    const pk = table.primaryKey;
    const inlinePk = pk?.columns.length === 1 && !pk.name;
    const columns = table.columns.map(
      (c) =>
        `  ${emitColumn(c, Boolean(inlinePk && pk?.columns[0] === c.name))}`
    );
    if (pk && !inlinePk) {
      imports.add("primaryKey");
      constraints.push(
        `primaryKey({ columns: [${pk.columns.map((c) => `t.${camel(c)}`).join(", ")}]${pk.name ? `, name: ${q(pk.name)}` : ""} })`
      );
    }
    const indexColumns = (idx: (typeof table.indexes)[number]) =>
      (idx.elements ?? idx.columns.map((value) => ({ kind: "column", value })))
        .map((e) =>
          e.kind === "expression" ? raw(e.value) : `t.${camel(e.value)}`
        )
        .join(", ");
    for (const u of table.uniqueConstraints) {
      if (u.elements?.some((e) => e.kind === "expression")) {
        imports.add("uniqueIndex");
        constraints.push(
          `uniqueIndex(${q(u.name ?? `${table.name}_unique_${constraints.length}`)}).on(${indexColumns({ ...u, type: u.type ?? null })})`
        );
      } else {
        imports.add("unique");
        constraints.push(
          `unique(${q(u.name ?? `${table.name}_${u.columns.join("_")}_key`)}).on(${u.columns.map((c) => `t.${camel(c)}`).join(", ")})`
        );
      }
    }
    for (const idx of table.indexes) {
      imports.add("index");
      constraints.push(
        `index(${q(idx.name ?? `${table.name}_idx_${constraints.length}`)}).using(${q(idx.type ?? "btree")}, ${indexColumns(idx)})`
      );
    }
    for (const fk of table.foreignKeys) {
      imports.add("foreignKey");
      const self =
        fk.refTable.schema === table.schema && fk.refTable.table === table.name;
      const target = self
        ? "t"
        : identity(fk.refTable.schema, fk.refTable.table);
      let value = `foreignKey({ columns: [${fk.columns.map((c) => `t.${camel(c)}`).join(", ")}], foreignColumns: [${fk.refColumns.map((c) => `${target}.${camel(c)}`).join(", ")}], name: ${q(fk.name ?? `${table.name}_${fk.columns.join("_")}_fkey`)} })`;
      if (fk.onDelete !== "none") value += `.onDelete(${q(fk.onDelete)})`;
      if (fk.onUpdate !== "none") value += `.onUpdate(${q(fk.onUpdate)})`;
      constraints.push(value);
    }
    for (const constraint of [
      ...(table.checks ?? []),
      ...table.columns.flatMap((c) => c.checks ?? []),
    ]) {
      imports.add("check");
      constraints.push(
        `check(${q(constraint.name ?? `${table.name}_check_${constraints.length}`)}, ${raw(constraint.expression)})`
      );
    }
    if (constraints.length) typeImports.add("PgTableExtraConfigValue");
    const callback = constraints.length
      ? `, (t): PgTableExtraConfigValue[] => [\n    ${constraints.join(",\n    ")}\n  ]`
      : "";
    const builder =
      table.schema === "public"
        ? "pgTable"
        : `${spaceName(table.schema)}.table`;
    blocks.push(
      `export const ${identity(table.schema, table.name)} = ${builder}(${q(table.name)}, {\n${columns.join(",\n")}\n}${callback});`
    );
  }
  const names = [...imports]
    .sort()
    .concat([...typeImports].sort().map((name) => `type ${name}`));
  return `${usesSql.value ? 'import { sql } from "drizzle-orm";\n' : ""}import {\n  ${names.join(",\n  ")},\n} from "drizzle-orm/pg-core";\n\n${blocks.join("\n\n")}\n`;
}
