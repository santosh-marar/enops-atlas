import { expect, test } from "bun:test";
import { SAMPLE_DBML } from "../data/sample-dbml";
import {
  checkMigration,
  describeChange,
  isSameAsLast,
  snapshotOf,
} from "../lib/schema-history";

const V1 = "Table users {\n  id int [pk]\n  email varchar\n}\n";
const V2 =
  "Table users {\n  id int [pk]\n  email text\n}\n\nTable posts {\n  id int [pk]\n}\n";

test("a change lists added tables and changed columns", () => {
  const change = describeChange(V1, V2);
  expect(change.isEmpty).toBe(false);
  expect(change.addedTables).toEqual(["public.posts"]);
  expect(change.modifiedColumns.join(" ")).toContain("public.users.email");
});

test("the first version shows everything as added", () => {
  const change = describeChange("", V1);
  expect(change.addedTables).toEqual(["public.users"]);
});

test("comments and spacing do not make a new version", () => {
  const same = `// a note\n${V1.replace("  email", "    email")}`;
  expect(isSameAsLast(snapshotOf(V1).digest, same)).toBe(true);
});

test("a real change does", () => {
  expect(isSameAsLast(snapshotOf(V1).digest, V2)).toBe(false);
  expect(isSameAsLast(undefined, V1)).toBe(false);
});

test("the sample schema has a stable digest", () => {
  expect(snapshotOf(SAMPLE_DBML).digest).toBe(snapshotOf(SAMPLE_DBML).digest);
});

test("migration check flags statements that lose data", () => {
  const result = checkMigration(
    "ALTER TABLE users DROP COLUMN email;\nCREATE INDEX i ON users (id);"
  );
  expect(result.destructive).toBe(true);
  expect(result.findings[0]?.reason).toBe("drops a column");
});

test("a harmless migration is not flagged", () => {
  const result = checkMigration("ALTER TABLE users ADD COLUMN age int;");
  expect(result.destructive).toBe(false);
  expect(result.statements).toBe(1);
});
