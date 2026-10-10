import type { ColumnDefault } from "@enops/atlas-schema";
import mysql from "mysql2/promise";
import type {
  IntrospectedDatabase,
  IntrospectedForeignKey,
  IntrospectedIndex,
  IntrospectedTable,
} from "./ir";

function parseEnumValues(type: string): string[] | undefined {
  if (!/^enum\(/i.test(type)) return undefined;
  const values: string[] = [];
  for (const match of type.matchAll(/'((?:[^'\\]|\\.|'')*)'/g))
    values.push(
      match[1]!
        .replaceAll("''", "'")
        .replace(
          /\\([0bnrtZ'"\\])/g,
          (_, value: string) =>
            ({ "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" })[
              value
            ] ?? value
        )
    );
  return values;
}
function defaultValue(row: mysql.RowDataPacket): ColumnDefault | undefined {
  if (row.column_default === null) return undefined;
  const value = String(row.column_default);
  if (/DEFAULT_GENERATED/i.test(row.extra))
    return { type: "expression", value };
  if (
    /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)\b/i.test(
      row.column_type
    )
  )
    return { literal: value, type: "number", value };
  if (
    /^(timestamp|datetime)/i.test(row.column_type) &&
    /^current_timestamp/i.test(value)
  )
    return { type: "expression", value };
  return { type: "string", value };
}
/** MySQL 8 metadata; no application queries or migrations are executed. */
export async function introspectMysql(
  connectionString: string
): Promise<IntrospectedDatabase> {
  const connection = await mysql.createConnection(connectionString);
  const readMetadata = async (
    query: string
  ): Promise<mysql.RowDataPacket[]> => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(query);
    return rows.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([name, value]) => [
            name.toLowerCase(),
            value,
          ])
        ) as mysql.RowDataPacket
    );
  };
  try {
    const tableRows = await readMetadata(
      "select table_name,table_type from information_schema.tables where table_schema=database() order by table_name"
    );
    if (
      tableRows.some((r) => r.TABLE_TYPE === "VIEW" || r.table_type === "VIEW")
    )
      throw new Error(
        "MySQL views require an additional introspection adapter"
      );
    const partitions = await readMetadata(
      "select table_name from information_schema.partitions where table_schema=database() and partition_name is not null"
    );
    if (partitions.length)
      throw new Error(
        "MySQL partition definitions are not represented by canonical v2"
      );
    const columns = await readMetadata(
      "select table_schema,table_name,column_name,column_type,is_nullable,column_default,extra from information_schema.columns where table_schema=database() order by table_name,ordinal_position"
    );
    const keys = await readMetadata(
      "select table_name,constraint_name,column_name,referenced_table_name,referenced_column_name,referenced_table_schema from information_schema.key_column_usage where table_schema=database() order by table_name,constraint_name,ordinal_position"
    );
    const indexes = await readMetadata(
      "select table_name,index_name,non_unique,seq_in_index,column_name,index_type,sub_part,collation,expression from information_schema.statistics where table_schema=database() order by table_name,index_name,seq_in_index"
    );
    const rules = await readMetadata(
      "select table_name,constraint_name,delete_rule,update_rule from information_schema.referential_constraints where constraint_schema=database()"
    );
    const checks = await readMetadata(
      `select tc.table_name,tc.constraint_name,tc.enforced,cc.check_clause from information_schema.table_constraints tc join information_schema.check_constraints cc on cc.constraint_schema=tc.constraint_schema and cc.constraint_name=tc.constraint_name where tc.constraint_schema=database() and tc.constraint_type='CHECK'`
    );
    const tables = new Map<string, IntrospectedTable>();
    const ensure = (name: string) => {
      let t = tables.get(name);
      if (!t) {
        t = {
          checks: [],
          columns: [],
          foreignKeys: [],
          indexes: [],
          name,
          schema: "public",
        };
        tables.set(name, t);
      }
      return t;
    };
    for (const row of tableRows) ensure(row.table_name);
    for (const row of columns) {
      if (/\b(?:VIRTUAL|STORED) GENERATED\b|\bon update\b/i.test(row.extra))
        throw new Error(
          "Generated columns and ON UPDATE defaults require an additional adapter"
        );
      const values = parseEnumValues(row.column_type);
      ensure(row.table_name).columns.push({
        autoIncrement: /auto_increment/i.test(row.extra),
        default: row.column_default,
        defaultValue: defaultValue(row),
        name: row.column_name,
        nativeType: row.column_type,
        nullable: row.is_nullable === "YES",
        primaryKey: false,
        unique: false,
        ...(values
          ? {
              enumName: `${row.table_name}_${row.column_name}_enum`,
              enumSchema: "public",
              enumValues: values,
            }
          : {}),
      });
    }
    const indexGroups = new Map<string, IntrospectedIndex>();
    for (const row of indexes) {
      if (
        row.sub_part !== null ||
        row.collation === "D" ||
        row.expression ||
        !["BTREE", "HASH"].includes(row.index_type)
      )
        throw new Error(
          "MySQL prefix, descending, functional or specialized indexes require an additional adapter"
        );
      const table = ensure(row.table_name);
      if (row.index_name === "PRIMARY") {
        table.primaryKey ??= { columns: [], name: "PRIMARY" };
        table.primaryKey.columns.push(row.column_name);
        const column = table.columns.find((c) => c.name === row.column_name);
        if (column) column.primaryKey = true;
        continue;
      }
      const id = JSON.stringify([row.table_name, row.index_name]);
      let idx = indexGroups.get(id);
      if (!idx) {
        idx = {
          columns: [],
          name: row.index_name,
          type: row.index_type.toLowerCase(),
          unique: row.non_unique === 0,
        };
        indexGroups.set(id, idx);
        table.indexes.push(idx);
      }
      idx.columns.push(row.column_name);
    }
    const actions = new Map(
      rules.map((r) => [JSON.stringify([r.table_name, r.constraint_name]), r])
    );
    const fkGroups = new Map<string, IntrospectedForeignKey>();
    for (const row of keys) {
      if (!row.referenced_table_name) continue;
      const ownSchema = columns[0]?.table_schema;
      if (ownSchema && row.referenced_table_schema !== ownSchema)
        throw new Error(
          "Cross-database MySQL references require an explicit database root adapter"
        );
      const id = JSON.stringify([row.table_name, row.constraint_name]);
      let fk = fkGroups.get(id);
      if (!fk) {
        const rule = actions.get(id);
        fk = {
          columns: [],
          name: row.constraint_name,
          onDelete: rule?.delete_rule ?? null,
          onUpdate: rule?.update_rule ?? null,
          refColumns: [],
          refSchema: "public",
          refTable: row.referenced_table_name,
        };
        fkGroups.set(id, fk);
        ensure(row.table_name).foreignKeys.push(fk);
      }
      fk.columns.push(row.column_name);
      fk.refColumns.push(row.referenced_column_name);
    }
    for (const row of checks) {
      if (row.enforced === "NO")
        throw new Error(
          "Unenforced check constraints are not represented by canonical v2"
        );
      ensure(row.table_name).checks!.push({
        column: null,
        expression: row.check_clause,
        name: row.constraint_name,
      });
    }
    return {
      dialect: "mysql",
      tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  } finally {
    await connection.end().catch(() => undefined);
  }
}
