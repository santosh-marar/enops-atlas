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
});
