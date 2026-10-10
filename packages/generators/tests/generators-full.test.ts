import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import {
  generateDrizzleSchema,
  generateFromCanonical,
  generatePostgresSql,
  generatePrismaSchema,
} from "../src";

const DBML = `
Enum order_status {
  pending
  paid
}

Table users {
  id uuid [pk]
  email varchar(255) [unique, not null]
  created_at timestamp [default: \`now()\`]
}

Table orders {
  id uuid [pk]
  user_id uuid [not null]
  status order_status [not null]
  total decimal(10,2)

  indexes {
    user_id [name: 'orders_user_idx']
    (user_id, status) [unique, name: 'orders_unique']
  }
}

Ref: orders.user_id > users.id
`;

const { schema } = normalize(parseDbml(DBML));

describe("generators (canonical IR)", () => {
  test("emits PostgreSQL DDL", () => {
    const sql = generatePostgresSql(schema);
    expect(sql).toContain('CREATE TYPE "public"."order_status" AS ENUM');
    expect(sql).toContain('CREATE TABLE "public"."users"');
    expect(sql).toContain('"email" varchar(255) NOT NULL UNIQUE');
    expect(sql).toContain(
      'FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id")'
    );
    expect(sql).toContain('CREATE INDEX "orders_user_idx"');
    expect(sql).toContain("DEFAULT (now())");
  });

  test("emits a Prisma schema", () => {
    const prisma = generatePrismaSchema(schema);
    expect(prisma).toContain("enum OrderStatus");
    expect(prisma).toContain("model Users");
    expect(prisma).toContain("model Orders");
    expect(prisma).toContain("@relation(fields: [userId]");
    expect(prisma).toContain("@unique");
  });

  test("emits a Drizzle schema", () => {
    const drizzle = generateDrizzleSchema(schema);
    expect(drizzle).toContain("import {");
    expect(drizzle).toContain('from "drizzle-orm/pg-core"');
    expect(drizzle).toContain('pgEnum("order_status"');
    expect(drizzle).toContain('pgTable("users"');
    expect(drizzle).toContain("foreignKey(");
  });

  test("generateFromCanonical dispatches to every target", () => {
    expect(generateFromCanonical(schema, { format: "sql" })).toMatchObject({
      format: "sql",
      ok: true,
    });
    expect(generateFromCanonical(schema, { format: "prisma" }).ok).toBe(true);
    expect(generateFromCanonical(schema, { format: "drizzle" }).ok).toBe(true);
    expect(generateFromCanonical(schema, { format: "dbml" }).ok).toBe(true);
  });

  test("rejects a non-v2 schema with diagnostics", () => {
    const legacy = { ...schema, version: undefined };
    const result = generateFromCanonical(legacy, { format: "sql" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === "SCHEMA_VERSION")).toBe(
        true
      );
    }
  });
});
