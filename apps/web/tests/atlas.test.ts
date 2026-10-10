import { expect, test } from "bun:test";
import { SAMPLE_DBML } from "../data/sample-dbml";
import { analyzeDbml, tableKey } from "../lib/atlas";

const SIMPLE = `
Table users {
  id int [pk]
}

Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}
`;

test("the sample schema parses into a canonical schema and graph", () => {
  const result = analyzeDbml(SAMPLE_DBML);

  expect(result.canonical.tables.length).toBe(10);
  expect(result.graph.nodes.size).toBe(10);
  expect(result.normalizeErrors).toEqual([]);
  expect(result.danglingEdges).toEqual([]);
});

test("a foreign key points from the referencing table to the referenced one", () => {
  const { canonical, graph } = analyzeDbml(SIMPLE);

  const posts = canonical.tables.find((table) => table.name === "posts");
  expect(posts?.foreignKeys).toHaveLength(1);
  expect(posts?.foreignKeys[0]?.columns).toEqual(["user_id"]);
  expect(posts?.foreignKeys[0]?.refTable.table).toBe("users");

  const outgoing = graph.adjacency.get(tableKey("public", "posts")) ?? [];
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]?.to).toBe(tableKey("public", "users"));
  expect(graph.adjacency.get(tableKey("public", "users"))).toEqual([]);
});

test("a foreign key to a missing table is a parse error", () => {
  expect(() =>
    analyzeDbml(`
Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}
`)
  ).toThrow(/does not exist/);
});

test("tableKey joins schema and table name", () => {
  expect(tableKey("ecommerce", "orders")).toBe("ecommerce.orders");
});
