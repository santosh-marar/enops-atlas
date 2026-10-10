import { describe, expect, test } from "bun:test";
import { POST } from "../app/api/import/route";

const post = (body: unknown, raw = false) =>
  POST(
    new Request("http://localhost/api/import", {
      body: raw ? (body as string) : JSON.stringify(body),
      method: "POST",
    })
  );

const PRISMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`;

const DRIZZLE = `import { integer, pgTable } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer("id").primaryKey(),
});
`;

describe("import route", () => {
  test("reads a prisma schema", async () => {
    const res = await post({
      files: [{ content: PRISMA, path: "schema.prisma" }],
      format: "prisma",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dbml).toContain("User");
    expect(body.dbml).toContain("Ref:");
  });

  test("reads a drizzle schema", async () => {
    const res = await post({
      files: [{ content: DRIZZLE, path: "schema.ts" }],
      format: "drizzle",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).dbml).toContain('Table "users"');
  });

  test("never runs the code it is given", async () => {
    const globals = globalThis as Record<string, unknown>;
    globals.__atlasImportRan = false;
    await post({
      files: [
        {
          content: `${DRIZZLE}\nglobalThis.__atlasImportRan = true;\n`,
          path: "schema.ts",
        },
      ],
      format: "drizzle",
    });
    expect(globals.__atlasImportRan).toBe(false);
  });

  test("an unreadable schema is a 422 with a reason", async () => {
    const res = await post({
      files: [{ content: "export const x = 1;", path: "schema.ts" }],
      format: "drizzle",
    });
    expect(res.status).toBe(422);
    expect(typeof (await res.json()).error).toBe("string");
  });

  test("bad requests are refused", async () => {
    expect((await post("not json", true)).status).toBe(400);
    expect((await post({ files: [], format: "prisma" })).status).toBe(400);
    expect(
      (
        await post({
          files: [{ content: "x", path: "a" }],
          format: "mongoose",
        })
      ).status
    ).toBe(400);
    expect(
      (await post({ files: [{ content: 1, path: "a" }], format: "prisma" }))
        .status
    ).toBe(400);
  });

  test("too many files are refused", async () => {
    const files = Array.from({ length: 51 }, (_, i) => ({
      content: "x",
      path: `f${i}.prisma`,
    }));
    expect((await post({ files, format: "prisma" })).status).toBe(400);
  });

  test("a body over 1 MB is refused", async () => {
    const res = await post({
      files: [{ content: "x".repeat(1_100_000), path: "big.prisma" }],
      format: "prisma",
    });
    expect(res.status).toBe(413);
  });
});
