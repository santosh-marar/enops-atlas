import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { renderSeedSql } from "../src/seed-sql";

const DBML = [
  "Table customers {",
  "  id BIGINT [pk]",
  "  email VARCHAR(255)",
  "  records (id, email) {",
  "    1, 'ada@example.com'",
  "    2, 'grace@example.com'",
  "  }",
  "}",
  "",
  "Table orders {",
  "  id BIGINT [pk]",
  "  customerId BIGINT",
  "  note TEXT",
  "  records (id, customerId, note) {",
  "    10, 1, 'first order'",
  "    11, 2, null",
  "  }",
  "}",
  "",
  "Ref: orders.customerId > customers.id",
].join("\n");

describe("seed sql", () => {
  test("orders parents before children and escapes values", () => {
    const canonical = normalize(parseDbml(DBML)).schema;
    const { sql, tablesSeeded } = renderSeedSql(canonical);
    expect(tablesSeeded).toEqual(["public.customers", "public.orders"]);
    expect(sql.indexOf('"customers"')).toBeLessThan(sql.indexOf('"orders"'));
    expect(sql).toContain(
      `INSERT INTO "customers" ("id", "email") VALUES (1, 'ada@example.com');`
    );
    expect(sql).toContain(
      `INSERT INTO "orders" ("id", "customerId", "note") VALUES (10, 1, 'first order');`
    );
    expect(sql).toContain(
      `INSERT INTO "orders" ("id", "customerId", "note") VALUES (11, 2, NULL);`
    );
  });

  test("renders mysql quoting on request", () => {
    const canonical = normalize(parseDbml(DBML)).schema;
    const { sql } = renderSeedSql(canonical, { dialect: "mysql" });
    expect(sql).toContain("INSERT INTO `customers` (`id`, `email`)");
  });

  test("tables outside the default schema keep their schema", () => {
    const canonical = normalize(
      parseDbml(`
Table sales.items {
  id int [pk]
  records (id) {
    1
  }
}
`)
    ).schema;
    const { sql, tablesSeeded } = renderSeedSql(canonical);
    expect(sql).toBe(`INSERT INTO "sales"."items" ("id") VALUES (1);`);
    expect(tablesSeeded).toEqual(["sales.items"]);
  });

  test("quotes and backslashes in values cannot break out of the statement", () => {
    const canonical = normalize(
      parseDbml(`
Table notes {
  id int [pk]
  body text
  records (id, body) {
    1, 'x'
  }
}
`)
    ).schema;
    const records = canonical.tables[0]?.records;
    if (!records) throw new Error("expected records");
    records.rows = [
      [
        { type: "number", value: 1 },
        { type: "string", value: "it's a \\ test" },
      ],
    ];
    expect(renderSeedSql(canonical).sql).toContain(`'it''s a \\ test'`);
    expect(renderSeedSql(canonical, { dialect: "mysql" }).sql).toContain(
      `'it''s a \\\\ test'`
    );
  });
});
