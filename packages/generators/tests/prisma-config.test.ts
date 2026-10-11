import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { get_dmmf } from "@prisma/prisma-schema-wasm";
import { generatePrismaConfig, generatePrismaSchema } from "../src/prisma";

const validate = (code: string) =>
  get_dmmf(
    JSON.stringify({ noColor: true, prismaSchema: [["schema.prisma", code]] })
  );

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

describe("generatePrismaSchema with Prisma 7", () => {
  const schema = generatePrismaSchema(
    normalize(parseDbml("Table users {\n id int [pk]\n}")).schema
  );

  test("leaves the connection URL to prisma.config.ts", () => {
    expect(schema).not.toMatch(/^\s*url\s*=/m);
    expect(schema).toContain('provider = "postgresql"');
  });

  test("validates, while a schema with a datasource url does not", () => {
    expect(() => validate(schema)).not.toThrow();
    const withUrl = schema.replace(
      'provider = "postgresql"',
      'provider = "postgresql"\n  url = env("DATABASE_URL")'
    );
    expect(() => validate(withUrl)).toThrow();
  });
});
