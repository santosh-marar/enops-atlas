import { get_config, get_dmmf } from "@prisma/prisma-schema-wasm";

// Prisma's parser reads schema text only. No generators, config modules,
// application code, environment variables, or database connections are run.
type Field = {
  name: string;
  dbName?: string;
  kind: string;
  type: string;
  isList: boolean;
  isRequired: boolean;
  isId: boolean;
  isUnique: boolean;
  isUpdatedAt?: boolean;
  nativeType?: [string, string[]];
  default?: unknown;
  relationFromFields?: string[];
  relationName?: string;
  relationToFields?: string[];
  relationOnDelete?: string;
  relationOnUpdate?: string;
};
type Model = {
  name: string;
  dbName?: string;
  schema?: string;
  fields: Field[];
};
type Enum = {
  name: string;
  dbName?: string;
  schema?: string;
  values: { name: string; dbName?: string }[];
};
type Index = {
  model: string;
  type: string;
  dbName?: string;
  algorithm?: string;
  fields: {
    name: string;
    sortOrder?: string;
    length?: number;
    operatorClass?: unknown;
  }[];
};
export const quote = (value: string) => JSON.stringify(value);
const qualified = (model: { name: string; dbName?: string; schema?: string }) =>
  `${quote(model.schema ?? "public")}.${quote(model.dbName ?? model.name)}`;
const action = (value: string) =>
  ({
    Cascade: "cascade",
    NoAction: "no action",
    Restrict: "restrict",
    SetDefault: "set default",
    SetNull: "set null",
  })[value];

export function prismaToDbml(sources: [string, string][]): {
  dbml: string;
  warnings: string[];
} {
  // DMMF omits ignored models/fields and get_config omits relationMode. Reject
  // these explicitly; a successful DMMF response is not a fidelity guarantee.
  const cleanSources: string[] = [];
  for (const [, source] of sources) {
    const syntax = source.replace(
      /"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
      (token) => (token.startsWith('"') ? token : " ")
    );
    cleanSources.push(syntax);
    if (/@{1,2}ignore\b/.test(syntax))
      throw new Error(
        "Ignored Prisma models/fields require database introspection; DMMF omits them."
      );
    if (/\bUnsupported\s*\(|\bview\s+\w+\s*\{|\bextensions\s*=/.test(syntax))
      throw new Error(
        "Prisma unsupported types, views or extensions require database introspection."
      );
    if (/\brelationMode\s*=\s*"prisma"/.test(syntax))
      throw new Error(
        "Prisma relationMode=prisma does not declare physical foreign keys."
      );
    if (/@relation\s*\([^)]*\bmap\s*:/.test(syntax))
      throw new Error(
        "Mapped foreign-key constraint names require a lossless database adapter."
      );
  }
  const { config, errors } = JSON.parse(
    get_config(
      JSON.stringify({ ignoreEnvVarErrors: true, prismaSchema: sources })
    )
  ) as {
    config: { datasources: { provider: string; relationMode?: string }[] };
    errors: unknown[];
  };
  if (errors.length)
    throw new Error("Prisma datasource configuration is invalid");
  if (
    config.datasources.length !== 1 ||
    config.datasources[0]?.provider !== "postgresql"
  )
    throw new Error(
      "Prisma conversion currently requires one PostgreSQL datasource."
    );
  if (config.datasources[0]?.relationMode === "prisma")
    throw new Error(
      "Prisma relationMode=prisma does not declare database foreign keys; automatic conversion is unavailable."
    );
  const { datamodel } = JSON.parse(
    get_dmmf(JSON.stringify({ noColor: true, prismaSchema: sources }))
  ) as {
    datamodel: {
      models: Model[];
      enums: Enum[];
      indexes: Index[];
      types: unknown[];
    };
  };
  if (datamodel.types.length)
    throw new Error("Prisma composite types require an additional adapter.");
  const warnings: string[] = [];
  const modelByName = new Map(datamodel.models.map((m) => [m.name, m]));
  const enumByName = new Map(datamodel.enums.map((e) => [e.name, e]));
  const column = (model: Model, name: string) => {
    const field = model.fields.find((f) => f.name === name);
    if (!field) throw new Error(`Unknown Prisma field ${model.name}.${name}`);
    return quote(field.dbName ?? field.name);
  };
  const typeMap: Record<string, string> = {
    BigInt: "bigint",
    Boolean: "boolean",
    Bytes: "bytea",
    DateTime: "timestamp(3)",
    Decimal: "decimal(65,30)",
    Float: "double precision",
    Int: "integer",
    Json: "jsonb",
    String: "text",
  };
  const nativeMap: Record<string, string> = {
    BigInt: "bigint",
    Bit: "bit",
    Boolean: "boolean",
    ByteA: "bytea",
    Char: "char",
    Date: "date",
    Decimal: "decimal",
    DoublePrecision: "double precision",
    Inet: "inet",
    Integer: "integer",
    Json: "json",
    JsonB: "jsonb",
    Money: "money",
    Oid: "oid",
    Real: "real",
    SmallInt: "smallint",
    Text: "text",
    Time: "time",
    Timestamp: "timestamp",
    Timestamptz: "timestamptz",
    Timetz: "timetz",
    Uuid: "uuid",
    VarBit: "varbit",
    VarChar: "varchar",
    Xml: "xml",
  };
  const typeOf = (field: Field) => {
    const en = enumByName.get(field.type);
    const native = field.nativeType;
    let type = en
      ? qualified(en)
      : native
        ? nativeMap[native[0]]
        : typeMap[field.type];
    if (!type)
      throw new Error(
        `Unsupported Prisma type: ${field.type}/${native?.[0] ?? "default"}`
      );
    if (native?.[1].length) type += `(${native[1].join(",")})`;
    if (field.isList) type += "[]";
    return type;
  };
  /** The column an implicit many-to-many join table points at: the single @id, or a lone @unique. */
  const keyOf = (model: Model) => {
    const key =
      model.fields.find((f) => f.isId) ??
      model.fields.find((f) => f.isUnique && f.kind !== "object");
    if (!key)
      throw new Error(
        `Implicit many-to-many on ${model.name} needs a single @id or @unique field.`
      );
    return key;
  };
  /** The exact number written in @default(...) for a field, read from the schema text. */
  const numericDefaultLiteral = (modelName: string, fieldName: string) => {
    for (const text of cleanSources) {
      const body = new RegExp(
        `\\bmodel\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`
      ).exec(text)?.[1];
      const literal = body
        ? new RegExp(
            `^\\s*${fieldName}\\s+[^\\n]*?@default\\(\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)`,
            "m"
          ).exec(body)?.[1]
        : undefined;
      if (literal) return literal;
    }
  };
  const implicitJoins = new Set<string>();
  const blocks = datamodel.enums.map(
    (e) =>
      `Enum ${qualified(e)} {\n${e.values.map((v) => `  ${quote(v.dbName ?? v.name)}`).join("\n")}\n}`
  );
  const refs: string[] = [];
  for (const model of datamodel.models) {
    const lines: string[] = [];
    for (const field of model.fields) {
      if (field.kind === "object") {
        const target = modelByName.get(field.type);
        if (!target)
          throw new Error(`Unknown Prisma relation target ${field.type}`);
        if (!field.relationFromFields?.length) {
          // Implicit many-to-many = a list on both sides of the *same* relation.
          // Two models that reference each other through different relations
          // are ordinary one-to-many pairs.
          const other = field.isList
            ? target.fields.find(
                (f) =>
                  f.type === model.name &&
                  f !== field &&
                  f.isList &&
                  f.relationName === field.relationName &&
                  !f.relationFromFields?.length
              )
            : undefined;
          if (other) {
            const relation =
              field.relationName ?? `${model.name}To${target.name}`;
            if (!implicitJoins.has(relation)) {
              implicitJoins.add(relation);
              // Prisma names the join table _<relation>; column A belongs to the
              // model that sorts first by name, B to the other. A self-relation
              // sorts by field name.
              const sides = [
                { field, model },
                { field: other ?? field, model: target },
              ].sort((x, y) =>
                x.model === y.model
                  ? x.field.name.localeCompare(y.field.name)
                  : x.model.name.localeCompare(y.model.name)
              );
              const [first, second] = sides as [
                { field: Field; model: Model },
                { field: Field; model: Model },
              ];
              const table = `_${relation}`;
              const joinName = qualified({
                name: table,
                schema: first.model.schema,
              });
              const typeA = typeOf({ ...keyOf(first.model), isList: false });
              const typeB = typeOf({ ...keyOf(second.model), isList: false });
              blocks.push(
                `Table ${joinName} {\n  "A" ${typeA} [not null]\n  "B" ${typeB} [not null]\n  indexes {\n    ("A", "B") [unique, name: ${quote(`${table}_AB_unique`)}]\n    "B" [name: ${quote(`${table}_B_index`)}]\n  }\n}`
              );
              for (const [name, side] of [
                ["A", first],
                ["B", second],
              ] as const) {
                refs.push(
                  `Ref: ${joinName}.${quote(name)} > ${qualified(side.model)}.${quote(keyOf(side.model).dbName ?? keyOf(side.model).name)} [delete: cascade, update: cascade]`
                );
              }
              warnings.push(
                `${first.model.name}<->${second.model.name}: Prisma's implicit many-to-many is represented by its join table ${table} (columns A and B).`
              );
            }
          }
          continue;
        }
        const from = field.relationFromFields.map((name) =>
          column(model, name)
        );
        const to = (field.relationToFields ?? []).map((name) =>
          column(target, name)
        );
        const endpoint = (names: string[]) =>
          names.length === 1 ? names[0] : `(${names.join(", ")})`;
        const nullable = field.relationFromFields.some(
          (name) => !model.fields.find((f) => f.name === name)?.isRequired
        );
        const onDelete = action(
          field.relationOnDelete ?? (nullable ? "SetNull" : "Restrict")
        );
        const onUpdate = action(field.relationOnUpdate ?? "Cascade");
        if (!(onDelete && onUpdate))
          throw new Error("Unsupported Prisma referential action");
        refs.push(
          `Ref: ${qualified(model)}.${endpoint(from)} > ${qualified(target)}.${endpoint(to)} [delete: ${onDelete}, update: ${onUpdate}]`
        );
        continue;
      }
      const en = enumByName.get(field.type);
      const type = typeOf(field);
      const settings = [field.isRequired ? "not null" : "null"];
      if (field.isId) settings.push("pk");
      if (field.isUnique) settings.push("unique");
      const def = field.default;
      if (def && typeof def === "object" && "name" in def) {
        const expression = def as { name: string; args: unknown[] };
        if (expression.name === "autoincrement") settings.push("increment");
        else if (expression.name === "now") settings.push("default: `now()`");
        else if (
          expression.name === "dbgenerated" &&
          typeof expression.args[0] === "string" &&
          !expression.args[0].includes("`")
        )
          settings.push(`default: \`${expression.args[0]}\``);
        else
          warnings.push(
            `${model.name}.${field.name}: application default ${expression.name} must be preserved in Prisma source.`
          );
      } else if (def !== undefined) {
        if (Array.isArray(def))
          throw new Error(
            "Prisma array defaults require an additional adapter."
          );
        if (
          ["Decimal", "Float"].includes(field.type) &&
          typeof def === "number"
        ) {
          // DMMF holds a double, which can round the literal. The schema text
          // is exact, so the default is read from it and must agree.
          const literal = numericDefaultLiteral(model.name, field.name);
          // DMMF's double can be off in the last digits; it only has to agree
          // closely enough to show the text is this field's default.
          if (
            literal === undefined ||
            Math.abs(Number(literal) - def) > Math.abs(def) * 1e-9 + 1e-12
          )
            throw new Error(
              "Prisma numeric defaults need exact source-literal extraction; DMMF floating-point defaults cannot prove fidelity"
            );
          settings.push(`default: ${literal}`);
        } else if (field.type === "BigInt" && typeof def === "string") {
          if (!/^-?\d+$/.test(def))
            throw new Error("Invalid Prisma bigint default");
          settings.push(`default: ${def}`);
        } else {
          const value =
            en && typeof def === "string"
              ? (en.values.find((v) => v.name === def)?.dbName ?? def)
              : def;
          settings.push(
            `default: ${typeof value === "string" ? quote(value) : String(value)}`
          );
        }
      }
      if (field.isUpdatedAt)
        warnings.push(
          `${model.name}.${field.name}: @updatedAt is application behavior, retained in original source.`
        );
      lines.push(
        `  ${column(model, field.name)} ${type.includes(" ") ? quote(type) : type} [${settings.join(", ")}]`
      );
    }
    const indexes = datamodel.indexes.filter((idx) => idx.model === model.name);
    const indexLines: string[] = [];
    for (const idx of indexes) {
      if (
        idx.fields.some((f) => f.sortOrder || f.length || f.operatorClass) ||
        (idx.algorithm && !["BTree", "Hash"].includes(idx.algorithm))
      )
        throw new Error(
          "Prisma advanced index options cannot be represented losslessly in DBML."
        );
      if (idx.fields.length === 1 && ["id", "unique"].includes(idx.type)) {
        if (idx.dbName || idx.algorithm)
          throw new Error(
            "Named or specialized single-column constraints require a lossless database adapter."
          );
        continue;
      }
      const attrs: string[] = [];
      if (idx.type === "id") attrs.push("pk");
      else if (idx.type === "unique") attrs.push("unique");
      else if (idx.type !== "normal")
        throw new Error(`Unsupported index type ${idx.type}`);
      if (idx.dbName) attrs.push(`name: ${quote(idx.dbName)}`);
      if (idx.algorithm) attrs.push(`type: ${idx.algorithm.toLowerCase()}`);
      indexLines.push(
        `    (${idx.fields.map((f) => column(model, f.name)).join(", ")})${attrs.length ? ` [${attrs.join(", ")}]` : ""}`
      );
    }
    if (indexLines.length)
      lines.push(`  indexes {\n${indexLines.join("\n")}\n  }`);
    blocks.push(`Table ${qualified(model)} {\n${lines.join("\n")}\n}`);
  }
  return {
    dbml: [
      'Project schema_model {\n database_type: "PostgreSQL"\n}',
      ...blocks,
      ...refs,
    ].join("\n\n"),
    warnings,
  };
}
