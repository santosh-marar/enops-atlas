import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { generateFromCanonical, generatePostgresSql } from "../src";

const { schema } = normalize(
  parseDbml("Table users {\n  id uuid [pk]\n  email varchar(255)\n}")
);

describe("@enops/atlas-generators", () => {
  test("emits SQL through the package boundary", () => {
    const sql = generatePostgresSql(schema);
    expect(sql).toContain('CREATE TABLE "public"."users"');
    const result = generateFromCanonical(schema, { format: "prisma" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.code).toContain("model Users");
  });

  describe("array columns", () => {
    const arrays = (body: string) =>
      normalize(parseDbml(`Table posts {\n  id int [pk]\n${body}\n}`)).schema;

    test("SQL and Drizzle keep every array, with its dimensions and default", () => {
      const schema = arrays(
        `  tags "text[]" [not null, default: '{}']\n  grid "int[][]"\n  labels "varchar(40)[]"`
      );
      const sql = generatePostgresSql(schema);
      expect(sql).toContain(`"tags" text[] NOT NULL DEFAULT '{}'`);
      expect(sql).toContain(`"grid" int[][]`);
      expect(sql).toContain(`"labels" varchar(40)[]`);
      const drizzle = generateFromCanonical(schema, { format: "drizzle" });
      expect(drizzle.ok).toBe(true);
      if (!drizzle.ok) return;
      expect(drizzle.code).toContain(
        `tags: text("tags").array().notNull().default(sql.raw("'{}'"))`
      );
      expect(drizzle.code).toContain(`grid: integer("grid").array().array()`);
      expect(drizzle.code).toContain(
        `labels: varchar("labels", { length: 40 }).array()`
      );
      const dbml = generateFromCanonical(schema, { format: "dbml" });
      expect(dbml.ok).toBe(true);
    });

    test("Prisma writes a nullable list, and says why it cannot write the rest", () => {
      const ok = generateFromCanonical(
        arrays(`  tags "text[]" [default: '{}']\n  scores "integer[]"`),
        { format: "prisma" }
      );
      expect(ok.ok).toBe(true);
      if (ok.ok) {
        expect(ok.code).toContain("tags String[] @default([]) @db.Text");
        expect(ok.code).toContain("scores Int[] @db.Integer");
      }
      const refused = generateFromCanonical(
        arrays(`  tags "text[]" [not null]\n  grid "int[][]"`),
        { format: "prisma" }
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok)
        expect(refused.diagnostics.map((d) => d.message)).toEqual([
          "Prisma cannot keep NOT NULL on a list column",
          "Prisma lists have only one dimension",
        ]);
    });
  });
});
