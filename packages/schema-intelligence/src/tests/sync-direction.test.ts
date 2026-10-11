import { describe, expect, test } from "bun:test";
import { extractForgeSchema } from "../repository-files";
import { schemaChangeTask, schemaSyncDirection } from "../sync-direction";

describe("three-way schema sync", () => {
  test.each([
    [null, null, "new", "to_atlas"],
    ["base", "base", "base", "synchronized"],
    ["base", "base", "new", "to_atlas"],
    ["new", "base", "base", "to_forge"],
    ["new", "base", "other", "conflict"],
    ["new", null, "other", "conflict"],
    ["new", "base", "new", "synchronized"],
  ] as const)(
    "Atlas %s / ancestor %s / Forge %s => %s",
    (atlasDigest, baselineDigest, forgeDigest, direction) => {
      expect(
        schemaSyncDirection({ atlasDigest, baselineDigest, forgeDigest })
      ).toBe(direction);
    }
  );
  test("SQL stays SQL and schema sync leaves changes uncommitted", () => {
    const task = schemaChangeTask({
      atlasDbml: "Table t {\n id int\n}",
      format: "postgres",
      sourcePaths: ["db/schema.sql"],
    });
    expect(task).toContain("plain SQL");
    expect(task).toContain("db/schema.sql");
    expect(task).toContain("Do not commit, push");
  });
  test("manual overlays replace old schema files and honor deletion", async () => {
    const files = [{ content: "Table old {\n id int\n}", path: "schema.dbml" }];
    const result = await extractForgeSchema(files, [
      { content: "", deleted: true, path: "schema.dbml" },
      {
        content: "Table current {\n id int [pk]\n}",
        deleted: false,
        path: "db/schema.dbml",
      },
    ]);
    expect(result?.sourcePaths).toEqual(["db/schema.dbml"]);
    expect(result?.dbml).not.toContain("old");
  });
  test("escaping paths never write outside the temporary checkout", async () => {
    await expect(
      extractForgeSchema(
        [{ content: "CREATE TABLE t (id int);", path: "../schema.sql" }],
        []
      )
    ).rejects.toThrow("Invalid schema source path");
  });
});
