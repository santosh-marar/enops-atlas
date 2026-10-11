import { expect, test } from "bun:test";
import { extractForgeSchema } from "../repository-files";
import {
  schemaSnapshot,
  schemaSynchronizationLosses,
} from "../schema-snapshot";
import { checkRepositorySchemaTarget } from "../schema-target";

const source = `import { pgTable, text, integer } from "drizzle-orm/pg-core";
export const event = pgTable("event", { id: integer("id").primaryKey(), tags: text("tags").array().notNull() });`;

test("Drizzle text arrays retain their physical type and pass exact target verification", async () => {
  const candidate = await extractForgeSchema(
    [{ content: source, path: "schema.ts" }],
    []
  );
  expect(candidate?.snapshot?.losses[0]?.code).toBe("UNSUPPORTED_TYPE");
  expect(schemaSynchronizationLosses(candidate!.snapshot!)).toEqual([]);
  const column = candidate!.snapshot!.physical.tables[0]!.columns.find(
    (column) => column.name === "tags"
  );
  expect(column?.type).toBe("text[]");
  const check = await checkRepositorySchemaTarget(
    { listFiles: async () => ["schema.ts"], readFile: async () => source },
    { dbml: candidate!.dbml, digest: candidate!.digest }
  );
  expect(check.passed).toBe(true);
  const scalar = await extractForgeSchema(
    [{ content: source.replace(".array()", ""), path: "schema.ts" }],
    []
  );
  expect(scalar!.digest).not.toBe(candidate!.digest);
  const wrong = await checkRepositorySchemaTarget(
    {
      listFiles: async () => ["schema.ts"],
      readFile: async () => source.replace(".array()", ""),
    },
    { dbml: candidate!.dbml, digest: candidate!.digest }
  );
  expect(wrong.reason).toBe("schema_mismatch");
});

test("unknown native and array types still fail closed", () => {
  for (const type of ["geometry", "geometry[]"]) {
    const snapshot = schemaSnapshot(
      `Table t {\n id integer [pk]\n value ${type}\n}`
    );
    expect(schemaSynchronizationLosses(snapshot)).toHaveLength(1);
  }
});
