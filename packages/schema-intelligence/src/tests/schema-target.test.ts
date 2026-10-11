import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractRepositoryDbml } from "../repository-dbml";
import { schemaSnapshot } from "../schema-snapshot";
import {
  checkRepositorySchemaTarget,
  describeSchemaTargetCheck,
} from "../schema-target";

/** In-memory stand-in for a remote workspace. */
function workspace(files: Record<string, string>) {
  return {
    listFiles: async () => Object.keys(files),
    readFile: async (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    },
  };
}
const target = (dbml: string) => ({
  dbml,
  digest: schemaSnapshot(dbml).digest,
});

const DATASOURCE = `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n`;
const prisma = (fields: string) =>
  `${DATASOURCE}model User {\n  id String @id @db.Uuid\n  name String\n${fields}  @@map("users")\n}\n`;
// What Atlas holds after the user adds `email` to the imported schema.
const ATLAS = `Project schema_model {
 database_type: "PostgreSQL"
}

Table "public"."users" {
  "id" uuid [not null, pk]
  "name" text [not null]
  email varchar(255) [not null, unique]
}
`;

describe("repository schema target gate", () => {
  test("a source-aware Prisma edit matches the approved Atlas schema", async () => {
    const check = await checkRepositorySchemaTarget(
      workspace({
        "prisma/schema.prisma": prisma(
          "  email String @unique @db.VarChar(255)\n"
        ),
        "src/index.ts": "export const app = 1;\n",
      }),
      target(ATLAS)
    );
    expect(check).toMatchObject({
      format: "prisma",
      passed: true,
      reason: "matches_target",
      sourcePaths: ["prisma/schema.prisma"],
    });
  });

  test("an unpatched or wrong Prisma edit fails with the remaining differences", async () => {
    const unpatched = await checkRepositorySchemaTarget(
      workspace({ "prisma/schema.prisma": prisma("") }),
      target(ATLAS)
    );
    expect(unpatched.passed).toBe(false);
    expect(unpatched.reason).toBe("schema_mismatch");
    expect(describeSchemaTargetCheck(unpatched)).toContain("users");

    // Nullable instead of NOT NULL is a different physical schema.
    const wrong = await checkRepositorySchemaTarget(
      workspace({
        "prisma/schema.prisma": prisma(
          "  email String? @unique @db.VarChar(255)\n"
        ),
      }),
      target(ATLAS)
    );
    expect(wrong.reason).toBe("schema_mismatch");
  });

  test("a Drizzle edit is verified the same way", async () => {
    const drizzle = (extra: string) =>
      `import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";\nexport const users = pgTable("users", {\n  id: uuid("id").primaryKey(),\n  name: text("name").notNull(),\n${extra}});\n`;
    // Atlas starts from the repository's own import, then the user edits it.
    const dir = await mkdtemp(join(tmpdir(), "schema-target-drizzle-"));
    await mkdir(join(dir, "src/db"), { recursive: true });
    await writeFile(join(dir, "src/db/schema.ts"), drizzle(""));
    const imported = await extractRepositoryDbml(dir);
    await rm(dir, { force: true, recursive: true });
    const atlas = imported!.dbml.replace(
      /("name" text \[not null\]\n)/,
      `$1  "email" varchar(255) [not null, unique]\n`
    );
    expect(atlas).not.toBe(imported!.dbml);

    const edited = await checkRepositorySchemaTarget(
      workspace({
        "src/db/schema.ts": drizzle(
          `  email: varchar("email", { length: 255 }).notNull().unique(),\n`
        ),
      }),
      target(atlas)
    );
    expect(edited).toMatchObject({ format: "drizzle", passed: true });

    const unpatched = await checkRepositorySchemaTarget(
      workspace({ "src/db/schema.ts": drizzle("") }),
      target(atlas)
    );
    expect(unpatched.reason).toBe("schema_mismatch");
  });

  test("a DBML repository matches after writing the Atlas schema", async () => {
    const check = await checkRepositorySchemaTarget(
      workspace({ "db/schema.dbml": ATLAS }),
      target(ATLAS)
    );
    expect(check).toMatchObject({ format: "dbml", passed: true });
  });

  test("adding a competing schema definition fails closed", async () => {
    const check = await checkRepositorySchemaTarget(
      workspace({
        "db/schema.dbml": ATLAS,
        "prisma/schema.prisma": prisma(
          "  email String @unique @db.VarChar(255)\n"
        ),
      }),
      target(ATLAS)
    );
    expect(check.passed).toBe(false);
    expect(check.reason).toBe("extraction_failed");
  });

  test("an edit that deletes the schema reports no schema", async () => {
    const check = await checkRepositorySchemaTarget(
      workspace({ "README.md": "hi", "src/index.ts": "export {};\n" }),
      target(ATLAS)
    );
    expect(check.reason).toBe("no_schema");
    expect(check.passed).toBe(false);
  });

  test("ignored directories and escaping paths are never read", async () => {
    const read: string[] = [];
    const files: Record<string, string> = {
      "../outside.prisma": "model Evil {}",
      "db/schema.dbml": ATLAS,
      "node_modules/pkg/schema.prisma": "model Dependency {}",
      "tests/fixture.dbml": "Table other { id int [pk] }",
    };
    const check = await checkRepositorySchemaTarget(
      {
        listFiles: async () => Object.keys(files),
        readFile: async (path) => {
          read.push(path);
          return files[path]!;
        },
      },
      target(ATLAS)
    );
    expect(check.passed).toBe(true);
    expect(read).toEqual(["db/schema.dbml"]);
  });
});
