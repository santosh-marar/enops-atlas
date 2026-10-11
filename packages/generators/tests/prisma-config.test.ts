import { describe, expect, test } from "bun:test";
import { generatePrismaConfig } from "../src/prisma";

describe("generatePrismaConfig", () => {
  test("points Prisma at the schema, migrations and DATABASE_URL", () => {
    const config = generatePrismaConfig();
    expect(config).toContain('from "prisma/config"');
    expect(config).toContain('schema: "prisma/schema.prisma"');
    expect(config).toContain('migrations: { path: "prisma/migrations" }');
    expect(config).toContain('datasource: { url: env("DATABASE_URL") }');
  });

  test("is the same every time", () => {
    expect(generatePrismaConfig()).toBe(generatePrismaConfig());
  });
});
