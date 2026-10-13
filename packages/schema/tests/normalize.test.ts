import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize, parseDbml } from "../src";

const raw = readFileSync(
  join(import.meta.dirname, "../src/canonical/__fixtures__/full.dbml"),
  "utf-8"
);

describe("normalize — real DBML fixture, real @dbml/core parse (no mocks)", () => {
  const parsed = parseDbml(raw);
  const result = normalize(parsed);

  it("retains unsupported geometry with an explicit error", () => {
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: "UNSUPPORTED_TYPE",
      column: "routing",
      table: "public.orders",
    });
    const orders = result.schema.tables.find((t) => t.name === "orders")!;
    expect(orders.columns.find((c) => c.name === "routing")?.type).toBe(
      "unsupported"
    );
  });

  describe("relationship direction — the regression case", () => {
    it('resolves "many side first" syntax correctly (orders.user_id > users.id)', () => {
      const orders = result.schema.tables.find((t) => t.name === "orders")!;
      const fk = orders.foreignKeys.find((f) => f.columns.includes("user_id"))!;
      expect(fk.refTable).toEqual({ schema: "public", table: "users" });
      expect(fk.refColumns).toEqual(["id"]);
    });

    it('resolves "one side first" syntax correctly (users.id < user_profiles.user_id) — this is the bug that was fixed', () => {
      const userProfiles = result.schema.tables.find(
        (t) => t.name === "user_profiles"
      )!;
      // Before the fix, this FK would have been attached to "users" pointing
      // at "user_profiles" — backwards. It must attach to user_profiles,
      // pointing at users, exactly like the many-first case above.
      expect(userProfiles.foreignKeys).toHaveLength(1);
      expect(userProfiles.foreignKeys[0]!.refTable).toEqual({
        schema: "public",
        table: "users",
      });
      expect(userProfiles.foreignKeys[0]!.columns).toEqual(["user_id"]);

      // And critically: "users" must NOT have a bogus FK pointing at user_profiles.
      const users = result.schema.tables.find((t) => t.name === "users")!;
      expect(users.foreignKeys).toHaveLength(0);
    });
  });

  describe("refTable shape", () => {
    it("is a structured {schema, table} object, not a concatenated string", () => {
      const orders = result.schema.tables.find((t) => t.name === "orders")!;
      const fk = orders.foreignKeys[0]!;
      expect(fk.refTable).toHaveProperty("schema");
      expect(fk.refTable).toHaveProperty("table");
      expect(typeof fk.refTable).toBe("object");
    });
  });

  describe("onDelete / onUpdate carry-through", () => {
    it("carries an explicit onDelete/onUpdate clause through to CanonicalForeignKey", () => {
      const orders = result.schema.tables.find((t) => t.name === "orders")!;
      const fk = orders.foreignKeys[0]!;
      expect(fk.onDelete).toBe("cascade");
      expect(fk.onUpdate).toBe("restrict");
    });

    it('defaults to "none" when no clause was written, not undefined/dropped', () => {
      const userProfiles = result.schema.tables.find(
        (t) => t.name === "user_profiles"
      )!;
      const fk = userProfiles.foreignKeys[0]!;
      expect(fk.onDelete).toBe("none");
      expect(fk.onUpdate).toBe("none");
    });
  });

  describe("default value carry-through", () => {
    const users = () => result.schema.tables.find((t) => t.name === "users")!;

    it("carries a number default", () => {
      const col = users().columns.find((c) => c.name === "login_count")!;
      expect(col.default).toEqual({ literal: "0", type: "number", value: 0 });
    });

    it("carries a boolean default", () => {
      const col = users().columns.find((c) => c.name === "is_active")!;
      expect(col.default).toEqual({ type: "boolean", value: true });
    });

    it("carries an expression default (backtick syntax)", () => {
      const col = users().columns.find((c) => c.name === "created_at")!;
      expect(col.default).toEqual({ type: "expression", value: "now()" });
    });

    it("carries a string default on an enum-typed column", () => {
      const col = users().columns.find((c) => c.name === "status")!;
      expect(col.type).toBe("enum");
      expect(col.enumName).toBe("order_status");
      expect(col.default).toEqual({ type: "string", value: "pending" });
    });

    it("leaves default unset (not null, just absent) when DBML specified none", () => {
      const col = users().columns.find((c) => c.name === "bio")!;
      expect(col.default).toBeUndefined();
    });
  });

  describe("autoIncrement carry-through", () => {
    it("is true when DBML declared [increment]", () => {
      const users = result.schema.tables.find((t) => t.name === "users")!;
      expect(users.columns.find((c) => c.name === "id")!.autoIncrement).toBe(
        true
      );
    });

    it("is false by default", () => {
      const users = result.schema.tables.find((t) => t.name === "users")!;
      expect(users.columns.find((c) => c.name === "email")!.autoIncrement).toBe(
        false
      );
    });
  });

  it("still correctly resolves the enum type end to end", () => {
    expect(result.schema.enums).toMatchObject([
      {
        name: "order_status",
        schema: "public",
        values: ["pending", "shipped", "delivered"],
      },
    ]);
  });

  it("still correctly closes varchar(255) into string with length", () => {
    const users = result.schema.tables.find((t) => t.name === "users")!;
    const email = users.columns.find((c) => c.name === "email")!;
    expect(email.type).toBe("string");
    expect(email.length).toBe(255);
  });

  it("still correctly closes decimal(10,2) into decimal with precision", () => {
    const orders = result.schema.tables.find((t) => t.name === "orders")!;
    const weight = orders.columns.find((c) => c.name === "weight_kg")!;
    expect(weight.type).toBe("decimal");
    expect(weight.precision).toEqual([10, 2]);
  });

  it("resolves arrays as their element type and keeps the dimensions", () => {
    const { errors, schema } = normalize(
      parseDbml(
        'Table posts {\n  id int [pk]\n  tags "text[]"\n  grid "int[][]"\n  labels "varchar(40)[]"\n  shapes "geometry[]"\n}'
      )
    );
    const column = (name: string) =>
      schema.tables[0]!.columns.find((c) => c.name === name)!;
    expect(column("tags")).toMatchObject({ arrayDimensions: 1, type: "text" });
    expect(column("grid")).toMatchObject({ arrayDimensions: 2, type: "int" });
    expect(column("labels")).toMatchObject({
      arrayDimensions: 1,
      length: 40,
      type: "string",
    });
    expect(column("tags").nativeType?.name).toBe("text[]");
    // An array of an unknown type stays unsupported.
    expect(column("shapes").type).toBe("unsupported");
    expect(errors.map((e) => e.column)).toEqual(["shapes"]);
  });
});
