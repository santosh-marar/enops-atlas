import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import {
  analyzeImpact,
  buildSchemaGraph,
  getNeighborhood,
  tableKey,
} from "../src";

const { schema } = normalize(
  parseDbml(
    [
      "Table users {",
      "  id uuid [pk]",
      "}",
      "Table posts {",
      "  id uuid [pk]",
      "  user_id uuid",
      "}",
      "Ref: posts.user_id > users.id",
    ].join("\n")
  )
);

describe("@enops/atlas-graph", () => {
  test("builds adjacency and traverses a neighborhood", () => {
    const { graph } = buildSchemaGraph(schema);
    const users = tableKey("public", "users");
    const posts = tableKey("public", "posts");
    expect(graph.nodes.has(users)).toBe(true);
    expect(graph.adjacency.get(posts)).toHaveLength(1);

    const neighborhood = getNeighborhood(graph, [users], { hops: 1 });
    expect([...neighborhood.tables]).toContain(posts);
  });

  test("analyzes removal impact", () => {
    const { graph } = buildSchemaGraph(schema);
    const result = analyzeImpact(schema, graph, {
      kind: "remove-table",
      schema: "public",
      table: "users",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.severity).toBe("breaking");
  });
});
