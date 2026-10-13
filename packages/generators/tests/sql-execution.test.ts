import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import postgres from "postgres";
import { generatePostgresSql } from "../src";

const url = process.env.INTROSPECTION_POSTGRES_URL;
describe.skipIf(!url)("generated PostgreSQL artifacts", () => {
  test("executes forward references and identity columns", async () => {
    const space = `atlas_codegen_${Math.random().toString(36).slice(2, 10)}`;
    const sql = postgres(url!, { max: 1 });
    try {
      const { schema } = normalize(
        parseDbml(
          `Table ${space}.a_child {\n id int [pk, increment]\n parent_id int [not null, ref: > ${space}.z_parent.id]\n}\nTable ${space}.z_parent {\n id int [pk, increment]\n}`
        )
      );
      await sql.unsafe(generatePostgresSql(schema));
      const parent = await sql.unsafe(
        `insert into "${space}".z_parent default values returning id`
      );
      const child = await sql.unsafe(
        `insert into "${space}".a_child(parent_id) values ($1) returning id`,
        [parent[0]!.id]
      );
      expect(child[0]!.id).toBe(1);
      await expect(
        Promise.resolve(
          sql.unsafe(`insert into "${space}".a_child(parent_id) values (999)`)
        )
      ).rejects.toThrow();
    } finally {
      await sql.unsafe(`drop schema if exists "${space}" cascade`);
      await sql.end({ timeout: 5 });
    }
  });
  test("executes native types, checks, exact defaults, and expression indexes", async () => {
    const space = `atlas_native_${Math.random().toString(36).slice(2, 10)}`;
    const sql = postgres(url!, { max: 1 });
    try {
      const { schema } = normalize(
        parseDbml(
          `Table ${space}.entries {\n id int [pk, increment]\n amount numeric(30,20) [not null, default: 0.1000000000000000001, check: \`amount >= 0\`]\n name varchar(40)\n payload jsonb\n indexes {\n payload [type: gin]\n \`lower(name)\` [name: 'lower_name']\n }\n}`
        )
      );
      await sql.unsafe(generatePostgresSql(schema));
      const rows = await sql.unsafe(
        `insert into "${space}".entries default values returning amount::text`
      );
      expect(rows[0]!.amount).toBe("0.10000000000000000010");
      await expect(
        Promise.resolve(
          sql.unsafe(`insert into "${space}".entries(amount) values (-1)`)
        )
      ).rejects.toThrow();
      const methods =
        await sql`select am.amname from pg_class c join pg_am am on am.oid=c.relam join pg_namespace n on n.oid=c.relnamespace where n.nspname=${space} and c.relkind='i'`;
      expect(methods.some((row) => row.amname === "gin")).toBe(true);
    } finally {
      await sql.unsafe(`drop schema if exists "${space}" cascade`);
      await sql.end({ timeout: 5 });
    }
  });
  test("executes array columns and their defaults", async () => {
    const space = `atlas_arrays_${Math.random().toString(36).slice(2, 10)}`;
    const sql = postgres(url!, { max: 1 });
    try {
      const { schema } = normalize(
        parseDbml(
          `Table ${space}.posts {\n id int [pk, increment]\n tags "text[]" [not null, default: '{}']\n grid "int[][]"\n}`
        )
      );
      await sql.unsafe(generatePostgresSql(schema));
      const rows = await sql.unsafe(
        `insert into "${space}".posts(grid) values ('{{1,2},{3,4}}') returning tags, grid`
      );
      expect(rows[0]!.tags).toEqual([]);
      expect(rows[0]!.grid).toEqual([
        [1, 2],
        [3, 4],
      ]);
    } finally {
      await sql.unsafe(`drop schema if exists "${space}" cascade`);
      await sql.end({ timeout: 5 });
    }
  });
});
