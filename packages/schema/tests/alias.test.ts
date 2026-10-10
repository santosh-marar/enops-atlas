import { describe, expect, it } from "bun:test";
import { normalize, parseDbml } from "../src";

const DBML = `
Table users as U {
  id int [pk]
  Indexes {
    id [type: hash]
  }
}

Table ecommerce.merchants as M {
  id int [pk]
}

Table posts {
  id int [pk]
  user_id int
  merchant_id int
}

Ref: posts.user_id > U.id
Ref: posts.merchant_id > M.id
`;

describe("table aliases", () => {
  it("preserves the alias on the parsed table", () => {
    const parsed = parseDbml(DBML);
    expect(parsed.tables.get("public.users")?.alias).toBe("U");
    expect(parsed.tables.get("ecommerce.merchants")?.alias).toBe("M");
  });

  it("resolves aliased ref endpoints to real table names", () => {
    const parsed = parseDbml(DBML);
    const usersRef = parsed.relationships.find(
      (rel) => rel.to.table === "users"
    );
    expect(usersRef?.from.table).toBe("posts");
    expect(parsed.relationships).toContainEqual(
      expect.objectContaining({
        from: expect.objectContaining({ table: "posts" }),
        to: expect.objectContaining({
          schema: "ecommerce",
          table: "merchants",
        }),
      })
    );
  });

  it("attaches canonical foreign keys to the real referenced table", () => {
    const { schema } = normalize(parseDbml(DBML));
    const posts = schema.tables.find((table) => table.name === "posts");
    const targets = posts?.foreignKeys.map((fk) => fk.refTable.table).sort();
    expect(targets).toEqual(["merchants", "users"]);
  });

  it("preserves full index type names", () => {
    const parsed = parseDbml(DBML);
    const users = parsed.tables.get("public.users");
    expect(users?.indexes[0]?.type).toBe("hash");
  });
});
