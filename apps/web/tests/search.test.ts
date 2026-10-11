import { expect, test } from "bun:test";
import { searchTables } from "../hooks/use-table-filter";
import { analyzeDbml } from "../lib/atlas";

const DBML = `
Table users {
  id int [pk]
  email varchar [unique]
}
Table posts {
  id int [pk]
  user_id int [ref: > users.id]
  title varchar
}
Table audit.events {
  id int [pk]
  actor_email varchar
}
`;

const chunks = analyzeDbml(DBML).canonical;

test("a column name finds its table", () => {
  expect(searchTables(chunks, "title")).toContain("public.posts");
});

test("an exact column name ranks the exact table first", () => {
  const keys = searchTables(chunks, "email");
  expect(keys[0]).toBe("public.users");
  expect(keys).toContain("audit.events");
});

test("a table name finds that table first", () => {
  expect(searchTables(chunks, "posts")[0]).toBe("public.posts");
});

test("a schema name finds the tables in it", () => {
  expect(searchTables(chunks, "audit")).toContain("audit.events");
});

test("an empty or unknown query finds nothing", () => {
  expect(searchTables(chunks, "")).toEqual([]);
  expect(searchTables(chunks, "zzzzzz")).toEqual([]);
});
