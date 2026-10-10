import { describe, expect, it } from "bun:test";
import { resolveDirection } from "../src";

describe("resolveDirection", () => {
  it('one-to-many: "*" side is always the FK holder, regardless of position', () => {
    // many-side-first: e1 is the "*" side
    const a = resolveDirection(
      { fieldNames: ["user_id"], relation: "*", tableName: "orders" },
      { fieldNames: ["id"], relation: "1", tableName: "users" }
    );
    expect(a.fk.tableName).toBe("orders");
    expect(a.ref.tableName).toBe("users");
    expect(a.cardinality).toBe("one-to-many");

    // one-side-first: e1 is the "1" side — must still resolve fk=orders
    const b = resolveDirection(
      { fieldNames: ["id"], relation: "1", tableName: "users" },
      { fieldNames: ["user_id"], relation: "*", tableName: "orders" }
    );
    expect(b.fk.tableName).toBe("orders");
    expect(b.ref.tableName).toBe("users");
    expect(b.cardinality).toBe("one-to-many");
  });

  it('one-to-one: both sides "1" — cardinality resolves correctly (direction is positional by necessity)', () => {
    const result = resolveDirection(
      { fieldNames: ["user_id"], relation: "1", tableName: "user_profiles" },
      { fieldNames: ["id"], relation: "1", tableName: "users" }
    );
    expect(result.cardinality).toBe("one-to-one");
  });

  it('many-to-many: both sides "*"', () => {
    const result = resolveDirection(
      { fieldNames: ["x"], relation: "*", tableName: "a" },
      { fieldNames: ["y"], relation: "*", tableName: "b" }
    );
    expect(result.cardinality).toBe("many-to-many");
  });
});
