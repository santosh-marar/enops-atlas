import { describe, expect, test } from "bun:test";
import { canonicalDigest } from "../src/canonical/compare";
import { normalize } from "../src/canonical/normalize";
import { parseDbml } from "../src/dbml/parse";
import { renderDbml } from "../src/dbml/render";

// MySQL/provider capability: DBML marked with database_type mysql must parse,
// normalize, hash, and re-render without a PostgreSQL dependency. This is the
// dialect path used by generated repositories that target MySQL hosts.

const MYSQL_DBML = [
  "Project ecommerce {",
  '  database_type: "mysql"',
  '  Note: "mysql flavor"',
  "}",
  "",
  "Table orders {",
  "  id BIGINT [pk, increment]",
  "  customerId BIGINT [not null]",
  "  total DECIMAL(10,2) [not null]",
  "  status VARCHAR(50) [default: 'pending']",
  "  note TEXT",
  "  createdAt TIMESTAMP [not null, default: `CURRENT_TIMESTAMP`]",
  "}",
  "",
  "Table customers {",
  "  id BIGINT [pk, increment]",
  "  email VARCHAR(255) [unique, not null]",
  "}",
  "",
  "Ref: orders.customerId > customers.id",
].join("\n");

describe("mysql dialect capability", () => {
  test("parses and normalizes mysql DBML", () => {
    const parsed = parseDbml(MYSQL_DBML);
    expect(parsed.dialect).toBe("mysql");
    const normalized = normalize(parsed);
    expect(normalized.errors).toEqual([]);
    const tableNames = normalized.schema.tables
      .map((table) => table.name)
      .sort();
    expect(tableNames).toEqual(["customers", "orders"]);

    const orders = normalized.schema.tables.find(
      (table) => table.name === "orders"
    );
    const status = orders?.columns.find((column) => column.name === "status");
    expect(status?.type).toBe("string");
    const total = orders?.columns.find((column) => column.name === "total");
    expect(total?.type).toBe("decimal");
    expect(orders?.foreignKeys).toHaveLength(1);
    expect(orders?.foreignKeys[0]?.columns).toEqual(["customerId"]);
  });

  test("round-trips through render and stays digest-stable", () => {
    const normalized = normalize(parseDbml(MYSQL_DBML)).schema;
    const rendered = renderDbml(normalized);
    const reparsed = normalize(parseDbml(rendered)).schema;
    expect(canonicalDigest(reparsed)).toBe(canonicalDigest(normalized));
    expect(reparsed.tables.length).toBe(2);
    const orders = reparsed.tables.find((table) => table.name === "orders");
    expect(orders?.foreignKeys).toHaveLength(1);
  });
});
