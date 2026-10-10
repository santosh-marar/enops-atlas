import postgres from "postgres";
import type {
  IntrospectedDatabase,
  IntrospectedForeignKey,
  IntrospectedIndex,
  IntrospectedTable,
} from "./ir";

const action = (value: string) =>
  ({
    a: "NO ACTION",
    c: "CASCADE",
    d: "SET DEFAULT",
    n: "SET NULL",
    r: "RESTRICT",
  })[value as "a"] ?? value;

/** Reads metadata only. Features absent from canonical v2 fail explicitly. */
export async function introspectPostgres(
  connectionString: string
): Promise<IntrospectedDatabase> {
  const sql = postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: 10,
    max: 1,
  });
  try {
    const unsupported = await sql`select n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and (c.relkind in ('v','m','p','f') or c.relispartition or c.relrowsecurity)`;
    if (unsupported.length)
      throw new Error(
        "Views, partitions, foreign tables and row security require an additional introspection adapter"
      );
    const constraintsUnsupported =
      await sql`select con.conname from pg_constraint con
      join pg_namespace n on n.oid=con.connamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      and (con.condeferrable or not con.convalidated or con.contype='x')`;
    if (constraintsUnsupported.length)
      throw new Error(
        "Deferrable, unvalidated and exclusion constraints are not represented by canonical v2"
      );
    const rows =
      await sql`select n.nspname as table_schema,c.relname as table_name
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      order by n.nspname,c.relname`;
    const tables = new Map<string, IntrospectedTable>();
    const key = (space: string, name: string) => JSON.stringify([space, name]);
    for (const row of rows)
      tables.set(key(row.table_schema, row.table_name), {
        checks: [],
        columns: [],
        foreignKeys: [],
        indexes: [],
        name: row.table_name,
        schema: row.table_schema,
      });
    const enums =
      await sql`select n.nspname as enum_schema,t.typname as enum_name,e.enumlabel as value
      from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
      order by n.nspname,t.typname,e.enumsortorder`;
    const enumValues = new Map<string, string[]>();
    for (const row of enums) {
      const id = key(row.enum_schema, row.enum_name);
      enumValues.set(id, [...(enumValues.get(id) ?? []), row.value]);
    }
    const columns =
      await sql`select n.nspname as table_schema,c.relname as table_name,a.attname as column_name,
      format_type(a.atttypid,a.atttypmod) as native_type, not a.attnotnull as nullable,
      pg_get_expr(d.adbin,d.adrelid) as column_default,a.attidentity,a.attgenerated,
      tn.nspname as type_schema,t.typname as type_name
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_type t on t.oid=a.atttypid join pg_namespace tn on tn.oid=t.typnamespace
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where c.relkind='r' and a.attnum>0 and not a.attisdropped and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      order by n.nspname,c.relname,a.attnum`;
    for (const row of columns) {
      if (row.attgenerated || row.attidentity === "a")
        throw new Error(
          "Generated columns and GENERATED ALWAYS identity require an additional canonical adapter"
        );
      const table = tables.get(key(row.table_schema, row.table_name));
      if (!table) continue;
      const values = enumValues.get(key(row.type_schema, row.type_name));
      table.columns.push({
        autoIncrement:
          row.attidentity === "d" ||
          /^nextval\(/.test(row.column_default ?? ""),
        default: row.column_default ?? null,
        ...(values
          ? {
              enumName: row.type_name,
              enumSchema: row.type_schema,
              enumValues: values,
            }
          : {}),
        name: row.column_name,
        nativeType: row.native_type,
        nullable: row.nullable,
        primaryKey: false,
        unique: false,
      });
    }
    const constraints =
      await sql`select n.nspname as table_schema,c.relname as table_name,con.conname,con.contype,
      array(select a.attname from unnest(con.conkey) with ordinality k(num,ord)
            join pg_attribute a on a.attrelid=c.oid and a.attnum=k.num order by k.ord) as columns,
      pg_get_expr(con.conbin,con.conrelid) as expression
      from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where con.contype in ('p','u','c') and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      order by n.nspname,c.relname,con.conname`;
    for (const row of constraints) {
      const table = tables.get(key(row.table_schema, row.table_name));
      if (!table) continue;
      if (row.contype === "p") {
        table.primaryKey = { columns: row.columns, name: row.conname };
        for (const c of table.columns)
          c.primaryKey = row.columns.includes(c.name);
      } else if (row.contype === "u")
        table.indexes.push({
          columns: row.columns,
          name: row.conname,
          type: "btree",
          unique: true,
        });
      else
        table.checks!.push({
          column: null,
          expression: row.expression,
          name: row.conname,
        });
    }
    const foreignKeys =
      await sql`select sn.nspname as table_schema,src.relname as table_name,con.conname,
      sa.attname as column_name,dn.nspname as ref_schema,dst.relname as ref_table,da.attname as ref_column,
      con.confdeltype as delete_rule,con.confupdtype as update_rule
      from pg_constraint con join pg_class src on src.oid=con.conrelid join pg_namespace sn on sn.oid=src.relnamespace
      join pg_class dst on dst.oid=con.confrelid join pg_namespace dn on dn.oid=dst.relnamespace
      cross join lateral unnest(con.conkey,con.confkey) with ordinality k(source_num,target_num,ord)
      join pg_attribute sa on sa.attrelid=src.oid and sa.attnum=k.source_num
      join pg_attribute da on da.attrelid=dst.oid and da.attnum=k.target_num
      where con.contype='f' and sn.nspname !~ '^pg_' and sn.nspname <> 'information_schema'
      order by sn.nspname,src.relname,con.conname,k.ord`;
    const groups = new Map<string, IntrospectedForeignKey>();
    for (const row of foreignKeys) {
      const id = JSON.stringify([
        row.table_schema,
        row.table_name,
        row.conname,
      ]);
      let fk = groups.get(id);
      if (!fk) {
        fk = {
          columns: [],
          name: row.conname,
          onDelete: action(row.delete_rule),
          onUpdate: action(row.update_rule),
          refColumns: [],
          refSchema: row.ref_schema,
          refTable: row.ref_table,
        };
        groups.set(id, fk);
        tables.get(key(row.table_schema, row.table_name))?.foreignKeys.push(fk);
      }
      fk.columns.push(row.column_name);
      fk.refColumns.push(row.ref_column);
    }
    const indexes =
      await sql`select n.nspname as table_schema,c.relname as table_name,ic.relname as index_name,
      am.amname as method,i.indisunique,i.indisvalid,i.indpred is not null as partial,
      i.indnatts > i.indnkeyatts as includes, i.indnullsnotdistinct as nulls_not_distinct,
      array(select pg_get_indexdef(i.indexrelid,k,true) from generate_series(1,i.indnkeyatts) k order by k) as definitions,
      array(select a.attname from unnest(i.indkey) with ordinality k(num,ord)
            left join pg_attribute a on a.attrelid=c.oid and a.attnum=k.num where k.ord<=i.indnkeyatts order by k.ord) as column_names
      from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_class ic on ic.oid=i.indexrelid join pg_am am on am.oid=ic.relam
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      and not exists(select 1 from pg_constraint con where con.conindid=i.indexrelid and con.contype in ('p','u'))
      order by n.nspname,c.relname,ic.relname`;
    for (const row of indexes) {
      if (
        row.partial ||
        row.includes ||
        row.nulls_not_distinct ||
        !row.indisvalid ||
        !["btree", "hash", "gin", "gist", "brin", "spgist"].includes(row.method)
      )
        throw new Error("Index options are not represented by canonical v2");
      const index: IntrospectedIndex = {
        columns: [],
        elements: [],
        name: row.index_name,
        type: row.method,
        unique: row.indisunique,
      };
      for (const [i, definition] of row.definitions.entries()) {
        const column = row.column_names[i];
        if (
          column &&
          definition !== column &&
          definition !== `"${column.replaceAll('"', '""')}"`
        )
          throw new Error(
            "Index ordering, collations or operator classes require an additional adapter"
          );
        const value = column ?? definition;
        index.columns.push(value);
        index.elements!.push({ kind: column ? "column" : "expression", value });
      }
      tables.get(key(row.table_schema, row.table_name))?.indexes.push(index);
    }
    return { dialect: "postgres", tables: [...tables.values()] };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
