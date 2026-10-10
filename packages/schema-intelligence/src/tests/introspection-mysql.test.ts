import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderDbml, validateCanonicalStructure } from "@enops/atlas-schema";
import {
  assessDatabaseCapabilities,
  introspectedToCanonical,
} from "../introspection/ir";
import { introspectMysql } from "../introspection/mysql";

// Live MySQL engine test. Enabled when INTROSPECTION_MYSQL_URL points at a
// running MySQL/MariaDB (the local docker container in CI/dev).

const url = process.env.INTROSPECTION_MYSQL_URL;
const enabled = Boolean(url);

describe.skipIf(!enabled)("live mysql introspection", () => {
  const mysql = () => import("mysql2/promise");

  beforeAll(async () => {
    const { createConnection } = await mysql();
    const connection = await createConnection(url as string);
    await connection.query("drop table if exists order_items");
    await connection.query("drop table if exists orders");
    await connection.query("drop table if exists customers");
    await connection.query(`
      create table customers (
        id bigint auto_increment primary key,
        email varchar(255) not null,
        tenant_id int not null,
        unique key uniq_email_tenant (email, tenant_id)
      )`);
    await connection.query(`
      create table orders (
        id bigint auto_increment primary key,
        customer_id bigint not null,
        status enum('pending','paid') not null default 'pending',
        total decimal(10,2),
        constraint fk_orders_customer foreign key (customer_id)
          references customers(id) on delete cascade
      )`);
    await connection.end();
  });

  afterAll(async () => {
    if (!enabled) return;
    const { createConnection } = await mysql();
    const connection = await createConnection(url as string);
    await connection.query("drop table if exists order_items");
    await connection.query("drop table if exists orders");
    await connection.query("drop table if exists customers");
    await connection.end();
  });

  test("reads tables, enums, unique keys, and foreign keys", async () => {
    const database = await introspectMysql(url as string);
    const report = assessDatabaseCapabilities(database);
    expect(report.unsupported).toEqual([]);
    expect(report.tables).toBe(2);
    expect(report.enumColumns).toBe(1);

    const canonical = introspectedToCanonical(database);
    expect(canonical.version).toBe(2);
    expect(validateCanonicalStructure(canonical)).toEqual([]);
    expect(() => renderDbml(canonical)).not.toThrow();
    const orders = canonical.tables.find((t) => t.name === "orders");
    expect(orders?.columns.find((c) => c.name === "status")?.default).toEqual({
      type: "string",
      value: "pending",
    });
    expect(orders?.foreignKeys[0]).toMatchObject({
      onDelete: "cascade",
      refTable: { table: "customers" },
    });
    expect(
      orders?.columns.find((column) => column.name === "status")
    ).toMatchObject({ type: "enum" });
    expect(
      orders?.columns.find((column) => column.name === "id")?.autoIncrement
    ).toBe(true);
    expect(
      canonical.tables
        .find((t) => t.name === "customers")
        ?.uniqueConstraints.some(
          (constraint) => constraint.columns.length === 2
        )
    ).toBe(true);
  });
});
