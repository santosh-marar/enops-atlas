import type {
  CanonicalColumn,
  CanonicalSchema,
  SchemaDiagnostic,
  SchemaTarget,
} from "@enops/atlas-schema";
import { validateCanonicalStructure } from "@enops/atlas-schema";

export class GenerationError extends Error {
  constructor(readonly diagnostics: SchemaDiagnostic[]) {
    super(diagnostics.map((d) => `${d.path}: ${d.message}`).join("; "));
  }
}

// DBML-only type spellings that have no literal Postgres equivalent but map
// cleanly onto one; translated here so validation and emission agree.
const NATIVE_TYPE_ALIASES: Record<string, string> = {
  datetime: "timestamp",
};

export function nativeParts(column: CanonicalColumn): {
  name: string;
  args: string | null;
} {
  // Array columns are checked and written as their element type.
  const raw = column.nativeType?.name
    .trim()
    .toLowerCase()
    .replace(/(?:\[\d*\])+$/, "")
    .trim();
  const match = raw?.match(/^([a-z ]+)\(([^)]+)\)(.*)$/);
  const name = (match ? `${match[1]}${match[3]}` : (raw ?? column.type)).trim();
  return {
    args: column.nativeType?.args ?? match?.[2] ?? null,
    name: NATIVE_TYPE_ALIASES[name] ?? name,
  };
}

const postgresTypes = new Set([
  "uuid",
  "varchar",
  "character varying",
  "char",
  "character",
  "text",
  "int",
  "integer",
  "int4",
  "smallint",
  "int2",
  "bigint",
  "int8",
  "real",
  "float4",
  "float",
  "float8",
  "double precision",
  "decimal",
  "numeric",
  "bool",
  "boolean",
  "json",
  "jsonb",
  "date",
  "timestamp",
  "timestamptz",
  "timestamp with time zone",
  "timestamp without time zone",
  "bytea",
]);

export function assertSupported(
  schema: CanonicalSchema,
  format: SchemaTarget["format"]
) {
  const diagnostics: SchemaDiagnostic[] = [
    ...validateCanonicalStructure(schema),
  ];
  const reject = (
    path: string,
    message: string,
    code: SchemaDiagnostic["code"] = "UNREPRESENTABLE"
  ) => diagnostics.push({ code, message, path });
  if (schema.version !== 2)
    reject(
      "schema",
      "Generation requires canonical schema v2",
      "SCHEMA_VERSION"
    );
  if (
    format !== "dbml" &&
    schema.dialect &&
    !["unknown", "postgres"].includes(schema.dialect)
  )
    reject(
      "schema.dialect",
      "SQL and ORM writers currently support PostgreSQL only",
      "DIALECT_MISMATCH"
    );
  for (const table of schema.tables) {
    const path = `${table.schema}.${table.name}`;
    if (format !== "dbml" && table.records)
      reject(path, "Export seed records separately", "UNSUPPORTED_RECORDS");
    if (
      format === "prisma" &&
      (table.checks?.length || table.columns.some((c) => c.checks?.length))
    )
      reject(path, "Prisma cannot preserve check constraints");
    if (
      format === "prisma" &&
      !table.primaryKey &&
      !table.columns.some((c) => c.unique && !c.nullable) &&
      !table.uniqueConstraints.some((u) =>
        u.columns.every((n) =>
          table.columns.some((c) => c.name === n && !c.nullable)
        )
      )
    )
      reject(path, "Prisma models require a non-null unique identity");
    for (const index of [...table.indexes, ...table.uniqueConstraints]) {
      if (
        format === "prisma" &&
        index.elements?.some((e) => e.kind === "expression")
      )
        reject(path, "Prisma cannot preserve expression indexes");
      if (
        table.uniqueConstraints.some((constraint) => constraint === index) &&
        index.type &&
        index.type !== "btree"
      )
        reject(path, "PostgreSQL unique indexes require btree");
    }
    for (const column of table.columns) {
      const at = `${path}.${column.name}`;
      if (format === "dbml") continue;
      const { name, args } = nativeParts(column);
      if (
        column.type !== "enum" &&
        !postgresTypes.has(name) &&
        column.nativeType
      )
        reject(
          at,
          `Native type ${name} is not verified for this writer`,
          "UNSUPPORTED_TYPE"
        );
      if (
        column.type === "unsupported" &&
        !(format === "sql" && postgresTypes.has(name))
      )
        reject(
          at,
          `Native type ${name} has no lossless ${format} mapping`,
          "UNSUPPORTED_TYPE"
        );
      if (format === "prisma" && column.arrayDimensions) {
        if (column.arrayDimensions > 1)
          reject(at, "Prisma lists have only one dimension");
        // Prisma always creates list columns as nullable.
        if (!column.nullable)
          reject(at, "Prisma cannot keep NOT NULL on a list column");
      }
      if (column.arrayDimensions && column.autoIncrement)
        reject(at, "Array columns cannot be identity columns");
      if (args && !/^\d+(?:\s*,\s*\d+)?$/.test(args))
        reject(at, "Unverified native type parameters");
      if (args && /^\d+(?:\s*,\s*\d+)?$/.test(args)) {
        const parameters = args.split(",").map(Number);
        const first = parameters[0]!;
        if (
          ["varchar", "character varying", "char", "character"].includes(name)
        ) {
          if (parameters.length !== 1 || first < 1 || first > 10_485_760)
            reject(at, "Invalid character length");
        } else if (["numeric", "decimal"].includes(name)) {
          if (first < 1 || first > 1000 || (parameters[1] ?? 0) > 1000)
            reject(at, "Invalid numeric precision or scale");
          if (format === "prisma" && (parameters[1] ?? 0) > first)
            reject(at, "Prisma cannot preserve a scale greater than precision");
        } else if (name.startsWith("timestamp") || name === "timestamptz") {
          if (parameters.length !== 1 || first > 6)
            reject(at, "Timestamp precision must be between zero and six");
        } else if (name === "float") {
          if (parameters.length !== 1 || first < 1 || first > 53)
            reject(at, "Floating point precision must be between one and 53");
        } else
          reject(at, `Native type ${name} does not accept these parameters`);
      }
      if (column.autoIncrement && !["int", "bigint"].includes(column.type))
        reject(at, "Identity columns must use an integer type");
      if (column.autoIncrement && column.default)
        reject(
          at,
          "Identity and an explicit default cannot be emitted together"
        );
      if (column.default?.type === "number") {
        const literal = column.default.literal ?? String(column.default.value);
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(literal))
          reject(at, "Invalid numeric default");
        if (
          !column.default.literal &&
          typeof column.default.value === "number" &&
          (!Number.isFinite(column.default.value) ||
            (Number.isInteger(column.default.value) &&
              !Number.isSafeInteger(column.default.value)))
        )
          reject(at, "Numeric default has already lost precision");
      }
      if (
        format === "prisma" &&
        column.default?.type === "expression" &&
        !/^now\(\)$/i.test(String(column.default.value)) &&
        !column.default.value
      )
        reject(at, "Empty default expression");
    }
    if (format !== "dbml")
      for (const fk of table.foreignKeys) {
        if (fk.cardinality === "many-to-many")
          reject(
            path,
            "Many-to-many relationships require an explicit junction table"
          );
        const target = schema.tables.find(
          (t) => t.name === fk.refTable.table && t.schema === fk.refTable.schema
        );
        const same = (names: string[]) =>
          names.length === fk.refColumns.length &&
          names.every((n, i) => n === fk.refColumns[i]);
        if (
          target &&
          !(
            same(target.primaryKey?.columns ?? []) ||
            target.uniqueConstraints.some(
              (u) =>
                same(u.columns) &&
                !u.elements?.some((e) => e.kind === "expression")
            ) ||
            (fk.refColumns.length === 1 &&
              target.columns.some(
                (c) => c.name === fk.refColumns[0] && c.unique
              ))
          )
        )
          reject(path, "Foreign keys must reference a primary or unique key");
      }
  }
  if (diagnostics.length) throw new GenerationError(diagnostics);
}

export function identifier(name: string, pascal = false): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  let value = parts
    .map(
      (p, i) =>
        (pascal || i > 0 ? p[0]?.toUpperCase() : p[0]?.toLowerCase()) +
        p.slice(1)
    )
    .join("");
  if (!value || /^\d/.test(value)) value = `value${value || "Empty"}`;
  if (
    [
      "await",
      "yield",
      "break",
      "case",
      "catch",
      "continue",
      "debugger",
      "delete",
      "do",
      "else",
      "extends",
      "finally",
      "for",
      "if",
      "in",
      "instanceof",
      "super",
      "switch",
      "this",
      "throw",
      "try",
      "typeof",
      "void",
      "while",
      "with",
      "true",
      "false",
      "null",
      "implements",
      "interface",
      "package",
      "private",
      "protected",
      "public",
      "static",
      "default",
      "class",
      "export",
      "import",
      "enum",
      "const",
      "function",
      "var",
      "let",
      "new",
      "return",
      "type",
      "model",
      "String",
      "Int",
      "Boolean",
      "DateTime",
      "Json",
      "Decimal",
      "BigInt",
      "Float",
    ].includes(value)
  )
    value = `${value}_`;
  return value;
}

export function identity(schema: string, name: string, pascal = false): string {
  return identifier(schema === "public" ? name : `${schema}_${name}`, pascal);
}

export function assertDistinct(names: string[], kind: string) {
  if (new Set(names).size !== names.length)
    throw new Error(
      `${kind} collide after identifier conversion; choose distinct names`
    );
}
