import { describe, expect, test } from "bun:test";
import { parseDbml } from "@enops/atlas-schema";
import { drizzleToDbml } from "../adapters/drizzle";
import { prismaToDbml } from "../adapters/prisma";
import { schemaChanges, schemaSnapshot } from "../schema-snapshot";

const datasource =
  'datasource db {\n provider = "postgresql"\n url = env("NEVER_READ_THIS_URL")\n}\n';
describe("schema adapter contracts", () => {
  test("Prisma BigInt defaults remain numeric and floating defaults fail closed", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        datasource +
          "model A {\n id Int @id\n n BigInt @default(9007199254740993)\n}",
      ],
    ]);
    expect(
      parseDbml(result.dbml).tables.get("public.A")!.columns[1]!.default
    ).toMatchObject({ literal: "9007199254740993", type: "number" });
    expect(() =>
      prismaToDbml([
        [
          "schema.prisma",
          datasource +
            "model A {\n id Int @id\n n Decimal @default(0.1000000000000000001)\n}",
        ],
      ])
    ).toThrow("exact source-literal");
  });
  test("Prisma parser preserves mapped names, native types, indexes and foreign keys", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        datasource +
          `
model User {
 id Int @id @default(autoincrement())
 email String @unique @db.VarChar(200)
 posts Post[]
 @@map("users")
}
model Post {
 id Int @id
 authorId Int @map("author_id")
 author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
 title String
 @@index([title])
}
`,
      ],
    ]);
    const parsed = parseDbml(result.dbml);
    expect(
      parsed.tables.get("public.users")?.columns.find((c) => c.name === "email")
        ?.unique
    ).toBe(true);
    expect(parsed.relationships[0]?.from.columns).toEqual(["author_id"]);
    expect(parsed.relationships[0]?.onDelete).toBe("cascade");
    expect(parsed.tables.get("public.Post")?.indexes[0]?.columns).toEqual([
      "title",
    ]);
  });
  test("Prisma supports composite keys and rejects implicit join-table loss", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        datasource +
          `
model Pair {
 a Int
 b Int
 @@id([a,b])
}
`,
      ],
    ]);
    expect(
      parseDbml(result.dbml).tables.get("public.Pair")?.indexes[0]?.columns
    ).toEqual(["a", "b"]);
    expect(() =>
      prismaToDbml([
        [
          "schema.prisma",
          datasource +
            `
model A {
 id Int @id
 bs B[]
}
model B {
 id Int @id
 as A[]
}
`,
        ],
      ])
    ).toThrow("Implicit many-to-many");
  });
  test("Drizzle parses declarations without executing top-level code", () => {
    const result = drizzleToDbml([
      {
        content: `
import { pgTable, integer, varchar, index } from 'drizzle-orm/pg-core';
throw new Error('MUST NEVER EXECUTE');
export const users = pgTable('users', { id: integer('id').primaryKey(), email: varchar('email', {length: 200}).notNull().unique() });
export const posts = pgTable('posts', { id: integer().primaryKey(), userId: integer('user_id').references(() => users.id, {onDelete: 'cascade'}) }, (t) => [index('posts_user_idx').on(t.userId)]);
`,
        path: "schema.ts",
      },
    ]);
    const parsed = parseDbml(result.dbml);
    expect(parsed.tables.size).toBe(2);
    expect(parsed.tables.get("public.users")?.columns[1]?.type).toContain(
      "varchar"
    );
    expect(parsed.relationships[0]?.onDelete).toBe("cascade");
    expect(parsed.tables.get("public.posts")?.indexes[0]?.name).toBe(
      "posts_user_idx"
    );
  });
  test("Drizzle refuses unresolved expressions and partial schemas", () => {
    expect(() =>
      drizzleToDbml([
        {
          content: `import {pgTable, integer} from 'drizzle-orm/pg-core'; export const users = pgTable('users', {id: integer().default(process.env.SECRET)});`,
          path: "schema.ts",
        },
      ])
    ).toThrow("defaults require");
    expect(() =>
      drizzleToDbml([
        {
          content: `import {pgTable, integer} from 'drizzle-orm/pg-core'; export const users = pgTable('users', {...common});`,
          path: "schema.ts",
        },
      ])
    ).toThrow("Spreads");
  });
  test("Prisma rejects data that its metadata parser silently omits", () => {
    expect(() =>
      prismaToDbml([
        [
          "schema.prisma",
          datasource + "model A {\n id Int @id\n hidden String @ignore\n}",
        ],
      ])
    ).toThrow("Ignored Prisma");
    expect(() =>
      prismaToDbml([
        [
          "schema.prisma",
          datasource.replace(
            'provider = "postgresql"',
            'provider = "postgresql"\n relationMode = "prisma"'
          ) + "model A {\n id Int @id\n}",
        ],
      ])
    ).toThrow("relationMode");
    expect(() =>
      prismaToDbml([
        [
          "schema.prisma",
          datasource + 'model A {\n id Int @id(map: "named_pk")\n}',
        ],
      ])
    ).toThrow("single-column constraints");
  });
  test("Prisma preserves mapped enum defaults and warns about application behavior", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        datasource +
          'enum State {\n ACTIVE @map("active")\n INACTIVE\n}\nmodel A {\n id String @id @default(cuid())\n state State @default(ACTIVE)\n updated DateTime @updatedAt\n}',
      ],
    ]);
    const parsed = parseDbml(result.dbml);
    expect(
      parsed.tables.get("public.A")?.columns.find((c) => c.name === "state")
        ?.default?.value
    ).toBe("active");
    expect(result.warnings).toHaveLength(2);
  });
  test("Drizzle rejects hidden tables, namespace imports and RLS wrappers", () => {
    const start =
      "import {pgTable, integer} from 'drizzle-orm/pg-core'; const a = pgTable('a', {id: integer()});";
    expect(() =>
      drizzleToDbml([
        {
          content: start + "const b = wrap(pgTable('b', {id: integer()}));",
          path: "schema.ts",
        },
      ])
    ).toThrow("Wrapped");
    expect(() =>
      drizzleToDbml([
        {
          content:
            start + "const b = pgTable('b', {id: integer()}).enableRLS();",
          path: "schema.ts",
        },
      ])
    ).toThrow("Wrapped");
    expect(() =>
      drizzleToDbml([
        {
          content:
            "import * as pg from 'drizzle-orm/pg-core'; const a = pg.pgTable('a', {id: pg.integer()});",
          path: "schema.ts",
        },
      ])
    ).toThrow("named pg-core");
  });
  test("semantic comparison ignores declaration order, retains checks/native types/indexes", () => {
    const a =
      "Table t {\n a integer\n b jsonb\n indexes {\n a [unique]\n }\n}\n";
    const b =
      "Table t {\n b jsonb\n a integer\n indexes {\n a [unique]\n }\n}\n";
    expect(schemaChanges(a, b).isEmpty).toBe(true);
    expect(schemaChanges(a, b.replace("jsonb", "json")).isEmpty).toBe(false);
    expect(
      schemaChanges(a, b.replace("[unique]", "[name: 'idx']")).isEmpty
    ).toBe(false);
    const relations =
      "Table a {\n id int [pk]\n}\nTable b {\n id int [pk]\n a int\n}\nRef original: b.a > a.id";
    expect(
      schemaChanges(relations, relations.replace("Ref original", "Ref renamed"))
        .isEmpty
    ).toBe(false);
    expect(
      schemaChanges(relations, relations + " [delete: cascade]").isEmpty
    ).toBe(false);
    const native = schemaSnapshot("Table t {\n id bytea\n}");
    expect(native.physical.tables[0]?.columns[0]?.type).toBe("bytea");
    expect(native.losses).toHaveLength(1);
  });
});
