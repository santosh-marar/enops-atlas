import { describe, expect, test } from "bun:test";
import { diffSchemas, normalize, parseDbml } from "../src";

const before = normalize(
  parseDbml("Table users {\n  id uuid [pk]\n  email varchar(255)\n}")
).schema;
const after = normalize(
  parseDbml(
    "Table users {\n  id uuid [pk]\n  email varchar(255)\n  name text\n}"
  )
).schema;

describe("@enops/atlas-schema", () => {
  test("exposes parse/normalize/diff through the boundary", () => {
    const diff = diffSchemas(before, after);
    expect(diff.modifiedTables).toHaveLength(1);
    expect(diff.modifiedTables[0]?.addedColumns?.map((c) => c.name)).toEqual([
      "name",
    ]);
  });
});
