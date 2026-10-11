import { describe, expect, test } from "bun:test";
import { extractForgeSchema } from "../repository-files";
import { schemaSnapshot } from "../schema-snapshot";
import { checkRepositorySchemaTarget } from "../schema-target";

const drizzle = `import {pgTable, integer, text, timestamp} from "drizzle-orm/pg-core";
export const users = pgTable("users", {
 id: integer("id").primaryKey(),
 displayName: text("display_name").notNull().$defaultFn(() => "guest"),
 updatedAt: timestamp("updated_at", {mode: "date"}).$onUpdate(() => new Date()),
});`;
const workspace = (content: string) => ({
  listFiles: async () => ["schema.ts"],
  readFile: async () => content,
});
async function baseline() {
  const extracted = await extractForgeSchema(
    [{ content: drizzle, path: "schema.ts" }],
    []
  );
  if (!extracted) throw new Error("Missing fixture");
  return {
    applicationBehavior: extracted.applicationBehavior,
    dbml: extracted.dbml,
    digest: extracted.digest,
  };
}

describe("schema sync preservation", () => {
  test.each([
    ["runtime default", drizzle.replace('.$defaultFn(() => "guest")', "")],
    [
      "runtime update hook",
      drizzle.replace(".$onUpdate(() => new Date())", ""),
    ],
    ["property mapping", drizzle.replace("displayName:", "name:")],
    ["table export", drizzle.replace("const users", "const accounts")],
    [
      "runtime timestamp mode",
      drizzle.replace('mode: "date"', 'mode: "string"'),
    ],
  ])(
    "rejects loss of %s even when physical schemas match",
    async (_name, content) => {
      const target = await baseline();
      const physicalOnly = await checkRepositorySchemaTarget(
        workspace(content!),
        { dbml: target.dbml, digest: target.digest }
      );
      expect(physicalOnly.passed).toBe(true);
      const protectedCheck = await checkRepositorySchemaTarget(
        workspace(content!),
        target
      );
      expect(protectedCheck.passed).toBe(false);
      expect(protectedCheck.reason).toBe("unsupported_or_lossy");
      expect(protectedCheck.warnings.join(" ")).toContain("runtime behavior");
    }
  );
  test("unchanged runtime behavior allows adding a database column", async () => {
    const target = await baseline();
    const edited = drizzle.replace(
      " id: integer",
      ' email: text("email"),\n id: integer'
    );
    const extracted = await extractForgeSchema(
      [{ content: edited, path: "schema.ts" }],
      []
    );
    const result = await checkRepositorySchemaTarget(workspace(edited), {
      ...target,
      dbml: extracted!.dbml,
      digest: extracted!.digest,
    });
    expect(result.passed).toBe(true);
  });
  test("formatting and comments do not appear as behavior loss", async () => {
    const target = await baseline();
    const result = await checkRepositorySchemaTarget(
      workspace(
        drizzle.replace('() => "guest"', '()   =>   /* same default */ "guest"')
      ),
      target
    );
    expect(result.passed).toBe(true);
  });
  test.each([
    ["exact numeric default", "9007199254740993", "9007199254740992"],
    ["decimal scale", "decimal(20,4)", "decimal(20,2)"],
    ["array", "text[]", "text"],
    ["nullability", "[not null]", "[null]"],
    ["unique constraint", "[unique]", ""],
    ["foreign-key action", "delete: restrict", "delete: cascade"],
  ])("physical digest detects changes to %s", (_name, before, after) => {
    const dbml =
      "Table users {\n id bigint [pk, default: 9007199254740993]\n balance decimal(20,4)\n tags text[]\n name text [not null]\n email text [unique]\n}\nTable posts {\n id bigint [pk]\n author bigint\n}\nRef: posts.author > users.id [delete: restrict]";
    expect(schemaSnapshot(dbml).digest).not.toBe(
      schemaSnapshot(dbml.replace(before!, after!)).digest
    );
  });
  test("Prisma application defaults remain visible as warnings", async () => {
    const result = await extractForgeSchema(
      [
        {
          content:
            'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\nmodel User {\n id String @id @default(cuid())\n updated DateTime @updatedAt\n}',
          path: "schema.prisma",
        },
      ],
      []
    );
    expect(result!.warnings).toHaveLength(2);
  });
});
