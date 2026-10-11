import { expect, test } from "bun:test";
import { analyzeImpact, getNeighborhood } from "@enops/atlas-graph";
import { analyzeDbml } from "../lib/atlas";

const DBML = `
Table users { id int [pk] }
Table posts { id int [pk]
  user_id int [ref: > users.id] }
Table comments { id int [pk]
  post_id int [ref: > posts.id] }
Table tags { id int [pk] }
`;

test("neighborhood follows foreign keys in both directions", () => {
  const { graph } = analyzeDbml(DBML);
  const result = getNeighborhood(graph, ["public.posts"], { hops: 1 });
  expect([...result.tables].sort()).toEqual([
    "public.comments",
    "public.posts",
    "public.users",
  ]);
  expect(result.truncated).toBe(false);
});

test("neighborhood is capped and says so", () => {
  const { graph } = analyzeDbml(DBML);
  const result = getNeighborhood(graph, ["public.posts"], {
    hops: 1,
    maxNodes: 2,
  });
  expect(result.tables.size).toBe(2);
  expect(result.truncated).toBe(true);
});

test("deleting a referenced table is breaking and names who is affected", () => {
  const { canonical, graph } = analyzeDbml(DBML);
  const result = analyzeImpact(canonical, graph, {
    kind: "remove-table",
    schema: "public",
    table: "users",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.report.severity).toBe("breaking");
  expect(result.report.affectedTables).toContain("public.posts");
});

test("deleting an unused table affects nothing else", () => {
  const { canonical, graph } = analyzeDbml(DBML);
  const result = analyzeImpact(canonical, graph, {
    kind: "remove-table",
    schema: "public",
    table: "tags",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.report.affectedTables).toEqual([]);
  expect(result.report.affectedRelationships).toEqual([]);
});
