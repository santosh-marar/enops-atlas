import { Parser } from "@dbml/core";
import { numericDefaultLiteral } from "./literals";
import type {
  Cardinality,
  CheckSchema,
  ColumnDefault,
  ColumnSchema,
  EnumSchema,
  EnumValueSchema,
  IndexSchema,
  IndexType,
  ParsedSchema,
  RecordSchema,
  RecordValueSchema,
  RefAction,
  RelationshipSchema,
  TableSchema,
} from "./types";

function parseNote(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function parseDefault(
  dbdefault: any,
  fieldSource: string
): ColumnDefault | null {
  if (!dbdefault) return null;
  switch (dbdefault.type) {
    case "boolean":
      if (dbdefault.value === null || dbdefault.value === "null")
        return { type: "null", value: null };
      return {
        type: "boolean",
        value: dbdefault.value === true || dbdefault.value === "true",
      };
    case "null":
      return { type: "null", value: null };
    case "number": {
      const literal = numericDefaultLiteral(fieldSource);
      const n = Number(literal);
      return {
        literal,
        type: "number",
        value: /^-?\d+$/.test(literal) && Number.isSafeInteger(n) ? n : literal,
      };
    }
    case "expression":
      return { type: "expression", value: String(dbdefault.value) };
    case "string":
    default:
      return { type: "string", value: String(dbdefault.value) };
  }
}

/**
 * @dbml/core's endpoint order is POSITIONAL — it matches the literal
 * syntax order the DBML author wrote, not "FK holder first." Verified
 * directly: `Ref: orders.user_id > users.id` gives endpoints[0]=orders
 * (relation '*'), but `Ref: users.id < orders.user_id` gives
 * endpoints[0]=users (relation '1') — same relationship, opposite
 * endpoint order, because the author wrote the "one" side first.
 *
 * Every downstream consumer (normalize.ts's FK attachment, in
 * particular) needs `from` to reliably mean "the table holding the FK
 * column" regardless of how the DBML was written. So direction is
 * resolved here, once, from the relation symbols themselves — not
 * left to positional endpoint order.
 */
export function resolveDirection(
  e1: {
    relation: string;
    schemaName?: string;
    tableName: string;
    fieldNames?: string[];
  },
  e2: {
    relation: string;
    schemaName?: string;
    tableName: string;
    fieldNames?: string[];
  }
): { fk: typeof e1; ref: typeof e2; cardinality: Cardinality } {
  if (e1.relation === "1" && e2.relation === "1") {
    // DBML short/long form defines the second endpoint as the FK holder.
    // @dbml/core normalizes inline one-to-one refs to target, then holder too.
    return { cardinality: "one-to-one", fk: e2, ref: e1 };
  }
  if (e1.relation === "*" && e2.relation === "*") {
    return { cardinality: "many-to-many", fk: e1, ref: e2 };
  }
  // One-to-many: whichever endpoint is the "*" side holds the FK column.
  return e1.relation === "*"
    ? { cardinality: "one-to-many", fk: e1, ref: e2 }
    : { cardinality: "one-to-many", fk: e2, ref: e1 };
}

const REF_ACTIONS = new Set<string>([
  "cascade",
  "restrict",
  "set null",
  "set default",
  "no action",
]);

// DBML allows any letter case ([delete: CASCADE]); the canonical form is lowercase.
function parseRefAction(raw: string | undefined): RefAction {
  const action = raw?.trim().toLowerCase();
  return action && REF_ACTIONS.has(action) ? (action as RefAction) : "none";
}

const INDEX_TYPES = new Set<string>([
  "brin",
  "btree",
  "gin",
  "gist",
  "hash",
  "spgist",
]);

function parseIndexType(raw: string | undefined): IndexType {
  return raw && INDEX_TYPES.has(raw) ? (raw as IndexType) : null;
}

function parseCheck(check: any, columnName: string | null = null): CheckSchema {
  return {
    column: columnName,
    expression: String(check.expression),
    name: check.name ?? null,
  };
}

function parseRecords(rawRecords: any[]): RecordSchema | null {
  if (!rawRecords?.length) return null;
  const [record] = rawRecords;
  return {
    columns: record.columns ?? [],
    rows: (record.values ?? []).map((row: any[]) =>
      row.map(
        (cell: any): RecordValueSchema => ({
          type: cell.type ?? "null",
          value: cell.value ?? null,
        })
      )
    ),
  };
}

function getSchemaName(obj: any): string {
  return obj?.schema?.name ?? "public";
}

function parseColumn(
  field: any,
  raw: string,
  knownEnums: Set<string>
): ColumnSchema {
  const typeName: string = field.type?.type_name ?? "unknown";
  const typeArgs: string | null = field.type?.args ?? null;

  const enumSchema = field.type?.schemaName ?? "public";
  const enumRef = knownEnums.has(`${enumSchema}.${typeName}`) ? typeName : null;

  const checks: CheckSchema[] = (field.checks ?? []).map((c: any) =>
    parseCheck(c, field.name)
  );

  return {
    checks,
    default: parseDefault(
      field.dbdefault,
      raw.slice(field.token?.start?.offset, field.token?.end?.offset)
    ),
    enumRef,
    ...(enumRef ? { enumSchema } : {}),
    increment: field.increment ?? false,
    name: field.name,
    note: parseNote(field.note),
    nullable: field.pk ? false : !(field.not_null ?? false),
    primaryKey: field.pk ?? false,
    type: typeName,
    typeArgs,
    unique: field.unique ?? false,
  };
}

function parseIndex(index: any): IndexSchema {
  return {
    columns: (index.columns ?? []).map((c: any) => c.value),
    elements: (index.columns ?? []).map((c: any) => ({
      kind: c.type === "expression" ? "expression" : "column",
      value: c.value,
    })),
    name: index.name ?? null,
    note: parseNote(index.note),
    pk: index.pk ?? false,
    type: parseIndexType(index.type),
    unique: index.unique ?? false,
  };
}

export function parseDbml(raw: string): ParsedSchema {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > 2_000_000
  )
    throw new Error("DBML must be a string no larger than 2 MB");
  const empty: ParsedSchema = {
    enums: new Map(),
    raw,
    relationships: [],
    tables: new Map(),
  };

  if (!raw.trim()) return empty;

  let db: any;
  try {
    db = new Parser().parse(raw, "dbmlv2");
  } catch (err: any) {
    const message =
      err?.diags?.[0]?.message ?? err?.message ?? "Unknown parse error";
    throw new Error(`DBML parse error: ${message}`, { cause: err });
  }

  const schemas = db.schemas ?? [];

  const knownEnums = new Set<string>();

  for (const schema of schemas) {
    for (const en of schema.enums ?? []) {
      const schemaName = getSchemaName(en);
      const fullName = `${schemaName}.${en.name}`;
      knownEnums.add(fullName);
    }
  }

  const enums = new Map<string, EnumSchema>();
  for (const schema of schemas) {
    for (const en of schema.enums ?? []) {
      const schemaName = getSchemaName(en);
      const fullName = `${schemaName}.${en.name}`;
      const values: EnumValueSchema[] = (en.values ?? []).map((v: any) => ({
        name: v.name,
        note: parseNote(v.note),
      }));
      enums.set(fullName, {
        name: en.name,
        note: parseNote(en.note),
        schema: schemaName,
        values,
      });
    }
  }

  const tables = new Map<string, TableSchema>();
  for (const schema of schemas) {
    for (const table of schema.tables ?? []) {
      const schemaName = getSchemaName(table);
      const fullName = `${schemaName}.${table.name}`;

      const tableChecks: CheckSchema[] = (table.checks ?? []).map((c: any) =>
        parseCheck(c, null)
      );

      const tableSchema: TableSchema = {
        ...(table.alias ? { alias: table.alias } : {}),
        checks: tableChecks,
        columns: (table.fields ?? []).map((field: any) =>
          parseColumn(field, raw, knownEnums)
        ),
        fullName,
        indexes: (table.indexes ?? []).map(parseIndex),
        name: table.name,
        note: parseNote(table.note),
        records: parseRecords(table.records ?? []),
        schema: schemaName,
      };
      const pk = tableSchema.indexes.find((i) => i.pk);
      if (pk)
        for (const col of tableSchema.columns)
          if (pk.columns.includes(col.name)) col.nullable = false;
      if (tables.has(fullName))
        throw new Error(
          "Ambiguous schema/table identity; dotted identifiers collide"
        );
      tables.set(fullName, tableSchema);
    }
  }

  // DBML refs may address a table by its alias (`Table users as U` -> `U.id`).
  // Resolve to the real table name once, here, so every downstream consumer
  // (canonical FK attachment, generators, graph, UIs) sees real names.
  const aliasToTable = new Map<string, { name: string; schema: string }>();
  for (const table of tables.values()) {
    if (!table.alias) continue;
    const target = { name: table.name, schema: table.schema };
    aliasToTable.set(`${table.schema}.${table.alias}`, target);
    if (!aliasToTable.has(table.alias)) {
      aliasToTable.set(table.alias, target);
    }
  }
  const resolveTable = (schemaName: string, tableName: string) =>
    aliasToTable.get(`${schemaName}.${tableName}`) ??
    aliasToTable.get(tableName) ?? { name: tableName, schema: schemaName };

  const relationships: RelationshipSchema[] = [];
  for (const schema of schemas) {
    for (const ref of schema.refs ?? []) {
      const e1 = ref.endpoints?.[0];
      const e2 = ref.endpoints?.[1];
      if (!(e1 && e2)) continue;

      const {
        fk,
        ref: refEndpoint,
        cardinality,
      } = resolveDirection(
        {
          fieldNames: e1.fieldNames,
          relation: e1.relation,
          schemaName: e1.schemaName,
          tableName: e1.tableName,
        },
        {
          fieldNames: e2.fieldNames,
          relation: e2.relation,
          schemaName: e2.schemaName,
          tableName: e2.tableName,
        }
      );

      const fkTable = resolveTable(fk.schemaName ?? "public", fk.tableName);
      const refTable = resolveTable(
        refEndpoint.schemaName ?? "public",
        refEndpoint.tableName
      );

      relationships.push({
        cardinality,
        from: {
          columns: fk.fieldNames ?? [],
          schema: fkTable.schema,
          table: fkTable.name,
        },
        name: ref.name ?? null,
        onDelete: parseRefAction(ref.onDelete),
        onUpdate: parseRefAction(ref.onUpdate),
        to: {
          columns: refEndpoint.fieldNames ?? [],
          schema: refTable.schema,
          table: refTable.name,
        },
      });
    }
  }

  const dialects: Record<string, ParsedSchema["dialect"]> = {
    mssql: "mssql",
    mysql: "mysql",
    oracle: "oracle",
    postgres: "postgres",
    postgresql: "postgres",
    snowflake: "snowflake",
    sqlite: "sqlite",
    sqlserver: "mssql",
  };
  return {
    dialect: dialects[String(db.databaseType ?? "").toLowerCase()] ?? "unknown",
    enums,
    raw,
    relationships,
    tables,
    ...(db.databaseType ? { databaseType: String(db.databaseType) } : {}),
  };
}
