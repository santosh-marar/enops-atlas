import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { get_dmmf } from "@prisma/prisma-schema-wasm";
import { getTableConfig } from "drizzle-orm/pg-core";
import ts from "typescript";
import {
  generateDrizzleSchema,
  generateFromCanonical,
  generatePostgresSql,
  generatePrismaSchema,
} from "../src";

const canonical = (dbml: string) => normalize(parseDbml(dbml)).schema;
const fixtures = [
  'Table "1 odd table" {\n id int [pk]\n "await" float(24)\n "switch" varchar\n}',
  "Table users {\n id int [pk, increment]\n email varchar(255) [unique, not null]\n}\nTable posts {\n id int [pk, increment]\n user_id int [ref: > users.id]\n}",
  "Table public.users {\n id int [pk]\n}\nTable audit.users {\n id int [pk]\n owner_id int [ref: > public.users.id]\n}",
  `Table parent {\n a int [not null]\n b int [not null]\n indexes {\n (b, a) [pk, name: 'parent_key']\n }\n}\nTable child {\n id int [pk]\n x int\n y int\n}\nRef child_parent: child.(y,x) > parent.(b,a) [update: cascade, delete: set null]`,
  `Enum status {\n "in-progress"\n ready\n}\nTable events {\n id int [pk]\n status status [not null, default: 'in-progress']\n date timestamp\n zoned timestamptz\n payload json\n count smallint\n amount decimal(20,10)\n}`,
  "Table nodes {\n id int [pk]\n parent_id int [ref: > nodes.id]\n}\nTable left {\n id int [pk]\n right_id int\n}\nTable right {\n id int [pk]\n left_id int [ref: > left.id]\n}\nRef: left.right_id > right.id",
];

for (const [index, fixture] of fixtures.entries()) {
  test(`Prisma consumer validates generated schema ${index}`, () => {
    const schema = canonical(fixture);
    const code = generatePrismaSchema(schema);
    expect(() =>
      get_dmmf(
        JSON.stringify({
          noColor: true,
          prismaSchema: [["schema.prisma", code]],
        })
      )
    ).not.toThrow();
  });
  test(`Drizzle consumer compiles and loads generated schema ${index}`, async () => {
    const directory = await mkdtemp(join(import.meta.dir, "..", ".consumer-"));
    try {
      const file = join(directory, "schema.ts");
      await writeFile(file, generateDrizzleSchema(canonical(fixture)));
      const program = ts.createProgram([file], {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
      });
      const errors = ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      expect(errors).toEqual([]);
      const module = await import(file);
      const configs = Object.values(module)
        .filter(
          (value): value is Parameters<typeof getTableConfig>[0] =>
            typeof value === "object" && value !== null
        )
        .map(getTableConfig);
      expect(configs.length).toBe(canonical(fixture).tables.length);
      if (fixture.includes("Ref child_parent:")) {
        const child = configs.find((config) => config.name === "child")!;
        expect(child.foreignKeys[0]?.getName()).toBe("child_parent");
        expect(child.foreignKeys[0]?.onUpdate).toBe("cascade");
        expect(child.foreignKeys[0]?.onDelete).toBe("set null");
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }, 30_000);
}

describe("generation capability boundary", () => {
  test("rejects cross-dialect requests instead of returning PostgreSQL for MySQL", () => {
    const schema = canonical(fixtures[0]!);
    const result = generateFromCanonical(schema, {
      dialect: "mysql",
      format: "sql",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(
        result.diagnostics.some((d) => d.code === "DIALECT_MISMATCH")
      ).toBe(true);
  });
  test("rejects unsupported native types without replacing binary with text", () => {
    const schema = canonical("Table docs {\n id int [pk]\n content bytea\n}");
    for (const format of ["prisma", "drizzle"] as const) {
      const result = generateFromCanonical(schema, { format });
      expect(result.ok).toBe(false);
      expect(() =>
        format === "prisma"
          ? generatePrismaSchema(schema)
          : generateDrizzleSchema(schema)
      ).toThrow();
    }
    expect(generatePostgresSql(schema)).toContain('"content" bytea');
  });
  test("preserves index methods and refuses unsupported Prisma expression indexes", () => {
    const schema = canonical(
      "Table docs {\n id int [pk]\n payload jsonb\n indexes {\n payload [type: gin]\n }\n}"
    );
    expect(schema.tables[0]?.indexes[0]?.type).toBe("gin");
    expect(generatePostgresSql(schema)).toContain("USING gin");
    expect(generateFromCanonical(schema, { format: "prisma" }).ok).toBe(false);
  });
  test("retains numeric precision and check constraints in PostgreSQL/Drizzle", () => {
    const schema = canonical(
      "Table amounts {\n id int [pk]\n amount numeric(30,20) [default: 0.1000000000000000001, check: `amount >= 0`]\n}"
    );
    expect(generatePostgresSql(schema)).toContain(
      "DEFAULT 0.1000000000000000001"
    );
    expect(generateDrizzleSchema(schema)).toContain(
      'sql.raw("0.1000000000000000001")'
    );
    expect(generateFromCanonical(schema, { format: "prisma" }).ok).toBe(false);
  });
});

test("native parameters retain float precision and reject invalid integer precision", () => {
  const schema = canonical(
    "Table metrics {\n id int [pk]\n amount float(24)\n}"
  );
  expect(generateDrizzleSchema(schema)).toContain('real("amount")');
  expect(generatePrismaSchema(schema)).toContain("@db.Real");
  const invalid = canonical("Table metrics {\n id int(8) [pk]\n}");
  expect(generateFromCanonical(invalid, { format: "sql" }).ok).toBe(false);
});
