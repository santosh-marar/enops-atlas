import type {
  CanonicalColumn,
  CanonicalEnum,
  CanonicalSchema,
  CanonicalTable,
  RefAction,
} from "@enops/atlas-schema";
import {
  assertDistinct,
  assertSupported,
  identifier,
  identity,
  nativeParts,
} from "./capabilities";

const modelName = (t: { schema: string; name: string }) =>
  identity(t.schema, t.name, true);
const fieldName = (name: string) => identifier(name);
const enumValue = (value: string) => identifier(value);
const actions: Record<RefAction, string> = {
  cascade: "Cascade",
  "no action": "NoAction",
  none: "NoAction",
  restrict: "Restrict",
  "set default": "SetDefault",
  "set null": "SetNull",
};

function prismaType(c: CanonicalColumn): { type: string; native?: string } {
  const { name, args } = nativeParts(c);
  switch (c.type) {
    case "uuid":
      return { native: "@db.Uuid", type: "String" };
    case "string":
      return {
        native: ["char", "character"].includes(name)
          ? `@db.Char(${args ?? c.length ?? 1})`
          : `@db.VarChar${args || c.length ? `(${args ?? c.length})` : ""}`,
        type: "String",
      };
    case "text":
      return { native: "@db.Text", type: "String" };
    case "int":
      return {
        native: ["smallint", "int2"].includes(name)
          ? "@db.SmallInt"
          : "@db.Integer",
        type: "Int",
      };
    case "bigint":
      return { native: "@db.BigInt", type: "BigInt" };
    case "float":
      return {
        native:
          ["real", "float4"].includes(name) ||
          (name === "float" && args && Number(args) <= 24)
            ? "@db.Real"
            : "@db.DoublePrecision",
        type: "Float",
      };
    case "decimal":
      return {
        native: `@db.Decimal${args || c.precision ? `(${args ?? c.precision!.join(", ")})` : ""}`,
        type: "Decimal",
      };
    case "boolean":
      return { type: "Boolean" };
    case "json":
      return {
        native: name === "json" ? "@db.Json" : "@db.JsonB",
        type: "Json",
      };
    case "date":
      return { native: "@db.Date", type: "DateTime" };
    case "timestamp":
      return {
        native: `@db.${["timestamptz", "timestamp with time zone"].includes(name) ? "Timestamptz" : "Timestamp"}(${args ?? 6})`,
        type: "DateTime",
      };
    case "enum":
      return { type: identity(c.enumSchema ?? "public", c.enumName!, true) };
    default:
      throw new Error(`Unsupported Prisma type: ${c.type}`);
  }
}
function defaultAttribute(c: CanonicalColumn): string | null {
  if (c.autoIncrement) return "@default(autoincrement())";
  const d = c.default;
  if (!d || d.type === "null") return null;
  if (d.type === "expression")
    return /^now\(\)$/i.test(String(d.value)) && c.type === "timestamp"
      ? "@default(now())"
      : `@default(dbgenerated(${JSON.stringify(String(d.value))}))`;
  if (c.type === "enum" && d.type === "string")
    return `@default(${enumValue(String(d.value))})`;
  return `@default(${d.type === "number" ? (d.literal ?? d.value) : JSON.stringify(d.value)})`;
}
function enumBlock(e: CanonicalEnum, multi: boolean): string {
  assertDistinct(e.values.map(enumValue), "Enum values");
  const lines = e.values.map(
    (value) =>
      `  ${enumValue(value)}${enumValue(value) === value ? "" : ` @map(${JSON.stringify(value)})`}`
  );
  lines.push(`  @@map(${JSON.stringify(e.name)})`);
  if (multi) lines.push(`  @@schema(${JSON.stringify(e.schema)})`);
  return `enum ${modelName(e)} {\n${lines.join("\n")}\n}`;
}
export function generatePrismaSchema(schema: CanonicalSchema): string {
  assertSupported(schema, "prisma");
  assertDistinct(
    [...schema.tables, ...schema.enums].map(modelName),
    "Prisma models and enums"
  );
  const spaces = [
    ...new Set([
      ...schema.tables.map((t) => t.schema),
      ...schema.enums.map((e) => e.schema),
    ]),
  ].sort();
  const multi = spaces.some((s) => s !== "public");
  const extraFields = new Map<CanonicalTable, string[]>();
  const used = new Map(
    schema.tables.map((t) => {
      assertDistinct(
        t.columns.map((c) => fieldName(c.name)),
        "Prisma fields"
      );
      return [t, new Set(t.columns.map((c) => fieldName(c.name)))] as const;
    })
  );
  // manager_id -> "manager"; a column without an _id suffix, or a composite key,
  // is named after the table it points to.
  const relationBase = (columns: string[], targetName: string) => {
    const [only] = columns;
    if (columns.length !== 1 || !only) return targetName;
    const stripped = only.replace(/_?id$/i, "");
    return stripped && stripped !== only ? stripped : `${only}_ref`;
  };
  const reserve = (t: CanonicalTable, base: string) => {
    let value = base;
    let i = 0;
    while (used.get(t)!.has(value)) value = `${base}_${++i}`;
    used.get(t)!.add(value);
    return value;
  };
  const append = (t: CanonicalTable, value: string) =>
    extraFields.set(t, [...(extraFields.get(t) ?? []), value]);
  for (const table of schema.tables)
    for (const [index, fk] of table.foreignKeys.entries()) {
      const target = schema.tables.find(
        (t) => t.schema === fk.refTable.schema && t.name === fk.refTable.table
      )!;
      const relation = JSON.stringify(
        `${modelName(table)}_${index}_${modelName(target)}`
      );
      const optional = fk.columns.some(
        (name) => table.columns.find((c) => c.name === name)!.nullable
      );
      const same = (names: string[]) =>
        names.length === fk.columns.length &&
        names.every((n, i) => n === fk.columns[i]);
      const unique =
        same(table.primaryKey?.columns ?? []) ||
        table.uniqueConstraints.some((u) => same(u.columns)) ||
        (fk.columns.length === 1 &&
          table.columns.some((c) => c.name === fk.columns[0] && c.unique));
      const base = relationBase(fk.columns, target.name);
      const localField = reserve(table, fieldName(base));
      // users.posts when one key links them; users.posts_author when several do.
      const keysToTarget = table.foreignKeys.filter(
        (other) =>
          other.refTable.schema === fk.refTable.schema &&
          other.refTable.table === fk.refTable.table
      ).length;
      const inverse = reserve(
        target,
        fieldName(
          keysToTarget > 1 || table === target
            ? `${table.name}_${base}`
            : table.name
        )
      );
      append(
        table,
        `  ${localField} ${modelName(target)}${optional ? "?" : ""} @relation(fields: [${fk.columns.map(fieldName).join(", ")}], references: [${fk.refColumns.map(fieldName).join(", ")}], name: ${relation}, onDelete: ${actions[fk.onDelete]}, onUpdate: ${actions[fk.onUpdate]}${fk.name ? `, map: ${JSON.stringify(fk.name)}` : ""})`
      );
      append(
        target,
        `  ${inverse} ${modelName(table)}${unique ? "?" : "[]"} @relation(${relation})`
      );
    }
  const blocks = schema.tables.map((table) => {
    const lines = table.columns.map((c) => {
      const type = prismaType(c);
      const modifiers: string[] = [];
      const pk = table.primaryKey?.columns;
      if (pk?.length === 1 && pk[0] === c.name)
        modifiers.push(
          `@id${table.primaryKey?.name ? `(map: ${JSON.stringify(table.primaryKey.name)})` : ""}`
        );
      if (c.unique) modifiers.push("@unique");
      const d = defaultAttribute(c);
      if (d) modifiers.push(d);
      if (type.native) modifiers.push(type.native);
      if (fieldName(c.name) !== c.name)
        modifiers.push(`@map(${JSON.stringify(c.name)})`);
      return `  ${fieldName(c.name)} ${type.type}${c.nullable && !pk?.includes(c.name) ? "?" : ""}${modifiers.length ? ` ${modifiers.join(" ")}` : ""}`;
    });
    lines.push(...(extraFields.get(table) ?? []));
    if (table.primaryKey && table.primaryKey.columns.length > 1)
      lines.push(
        `  @@id([${table.primaryKey.columns.map(fieldName).join(", ")}]${table.primaryKey.name ? `, map: ${JSON.stringify(table.primaryKey.name)}` : ""})`
      );
    for (const u of table.uniqueConstraints)
      lines.push(
        `  @@unique([${u.columns.map(fieldName).join(", ")}]${u.name ? `, map: ${JSON.stringify(u.name)}` : ""})`
      );
    for (const idx of table.indexes) {
      if (idx.type && !["btree", "hash"].includes(idx.type))
        throw new Error(
          `Prisma index method ${idx.type} is not verified by this writer`
        );
      lines.push(
        `  @@index([${idx.columns.map(fieldName).join(", ")}]${idx.name ? `, map: ${JSON.stringify(idx.name)}` : ""}${idx.type === "hash" ? ", type: Hash" : ""})`
      );
    }
    lines.push(`  @@map(${JSON.stringify(table.name)})`);
    if (multi) lines.push(`  @@schema(${JSON.stringify(table.schema)})`);
    return `model ${modelName(table)} {\n${lines.join("\n")}\n}`;
  });
  const header = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")${multi ? `\n  schemas = ${JSON.stringify(spaces)}` : ""}\n}`;
  return `${[header, ...schema.enums.map((e) => enumBlock(e, multi)), ...blocks].join("\n\n")}\n`;
}
