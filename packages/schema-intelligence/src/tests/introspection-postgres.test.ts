import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderDbml, validateCanonicalStructure } from "@enops/atlas-schema";
import {
  assessDatabaseCapabilities,
  introspectedToCanonical,
} from "../introspection/ir";
import { introspectPostgres } from "../introspection/postgres";

const url = process.env.INTROSPECTION_POSTGRES_URL;
const enabled = Boolean(url);
const schema = `introspection_${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!enabled)("live postgres introspection", () => {
  beforeAll(async () => {
    const postgres = (await import("postgres")).default;
    const client = postgres(url as string, { max: 1 });
    await client.unsafe(`create schema "${schema}"`);
    await client.unsafe(
      `create type "${schema}".order_status as enum ('pending','paid')`
    );
    await client.unsafe(`
      create table "${schema}".customers (
        id bigserial primary key,
        email varchar(255) not null,
        tenant_id integer not null,
        unique (email, tenant_id)
      )`);
    await client.unsafe(`
      create table "${schema}".orders (
        id bigserial primary key,
        customer_id bigint not null references "${schema}".customers(id) on delete cascade,
        status "${schema}".order_status not null default 'pending',
        total numeric(10,2)
      )`);
    await client.unsafe(
      `create table "${schema}".parents (a integer not null,b integer not null,primary key(b,a))`
    );
    await client.unsafe(
      `create table "${schema}".children (id integer primary key,a integer,b integer,foreign key(b,a) references "${schema}".parents(b,a))`
    );
    await client.unsafe(
      `create index customer_email_idx on "${schema}".customers(email)`
    );
    await client.unsafe(
      `alter table "${schema}".orders add constraint nonnegative check(total >= 0)`
    );
    await client.end({ timeout: 5 });
  });

  afterAll(async () => {
    const postgres = (await import("postgres")).default;
    const client = postgres(url as string, { max: 1 });
    await client.unsafe(`drop schema if exists "${schema}" cascade`);
    await client.end({ timeout: 5 });
  });

  test("reads tables, enums, keys, and foreign keys", async () => {
    const database = await introspectPostgres(url as string);
    const scoped = {
      ...database,
      tables: database.tables.filter((table) => table.schema === schema),
    };
    const report = assessDatabaseCapabilities(scoped);
    expect(report.unsupported).toEqual([]);
    expect(report.tables).toBe(4);
    expect(report.enumColumns).toBe(1);

    const canonical = introspectedToCanonical(scoped);
    expect(canonical.version).toBe(2);
    expect(validateCanonicalStructure(canonical)).toEqual([]);
    expect(() => renderDbml(canonical)).not.toThrow();
    expect(
      canonical.tables.find((t) => t.name === "parents")?.primaryKey?.columns
    ).toEqual(["b", "a"]);
    expect(
      canonical.tables.find((t) => t.name === "children")?.foreignKeys[0]
    ).toMatchObject({ columns: ["b", "a"], refColumns: ["b", "a"] });
    const orders = canonical.tables.find((t) => t.name === "orders");
    expect(orders?.checks?.[0]?.name).toBe("nonnegative");
    expect(orders?.columns.find((c) => c.name === "total")?.precision).toEqual([
      10, 2,
    ]);
    expect(
      canonical.tables.find((t) => t.name === "customers")?.indexes[0]?.name
    ).toBe("customer_email_idx");
    expect(orders?.foreignKeys[0]?.refTable.table).toBe("customers");
    expect(orders?.foreignKeys[0]?.onDelete).toBe("cascade");
    expect(
      orders?.columns.find((column) => column.name === "status")?.type
    ).toBe("enum");
    expect(
      canonical.tables
        .find((t) => t.name === "customers")
        ?.uniqueConstraints.some(
          (constraint) => constraint.columns.length === 2
        )
    ).toBe(true);
  });
});
