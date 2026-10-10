import { describe, expect, test } from "bun:test";
import {
  assessSchemaTarget,
  canonicalDigest,
  checkDiffScope,
  diffSchemas,
  exportCanonicalDbml,
  normalize,
  parseDbml,
  renderDbml,
  validateCanonicalStructure,
} from "@enops/atlas-schema";
import { schemaSnapshot } from "../schema-snapshot";

const canonical = (raw: string) => normalize(parseDbml(raw)).schema;
function roundTrip(raw: string) {
  const before = canonical(raw);
  const output = renderDbml(before);
  const after = canonical(output);
  expect(canonicalDigest(after)).toBe(canonicalDigest(before));
  expect(diffSchemas(before, after).isEmpty).toBe(true);
  return { after, before, output };
}

describe("loss-aware schema foundation", () => {
  test("an empty project retains its declared database dialect", () => {
    const { before } = roundTrip(
      'Project p {\n database_type: "PostgreSQL"\n}'
    );
    expect(before.dialect).toBe("postgres");
    expect(before.databaseType).toBe("PostgreSQL");
    expect(before.tables).toHaveLength(0);
  });

  test("native storage semantics survive canonical rendering", () => {
    const { output } = roundTrip(
      'Project p {\n database_type: "PostgreSQL"\n}\nTable t {\n id int [pk]\n j jsonb\n ts timestamptz(6)\n small smallint\n money decimal(20,8)\n fixed char(8)\n array "integer[]"\n}'
    );
    for (const type of [
      "jsonb",
      "timestamptz(6)",
      "smallint",
      "decimal(20,8)",
      "char(8)",
      "integer[]",
    ])
      expect(output).toContain(type);
  });
  test("exact defaults do not collide in snapshots", () => {
    for (const [a, b] of [
      ["9007199254740993", "9007199254740992"],
      ["0.10000000000000000001", "0.1"],
      ["-9007199254740993", "-9007199254740992"],
    ]) {
      const raw = `Table t {\n n decimal [default: ${a}]\n}`;
      expect(roundTrip(raw).output).toContain(a!);
      expect(schemaSnapshot(raw).digest).not.toBe(
        schemaSnapshot(raw.replace(a!, b!)).digest
      );
    }
  });
  test("default extraction ignores misleading notes and comments", () => {
    const raw = `Table t {\n n bigint [note: 'default: 77', default: /*default: 42*/ 9007199254740993]\n}`;
    expect(roundTrip(raw).output).toContain("default: 9007199254740993");
  });
  test("null, boolean and escaped string defaults round trip", () => {
    roundTrip(
      `Table t {\n n text [default: null]\n b boolean [default: true]\n x text [default: 'hello "world"']\n}`
    );
  });
  test("single unique and named composite constraints are retained", () => {
    const { before } = roundTrip(
      'Table t {\n a int\n b int\n indexes {\n a [unique, name: "uq_a"]\n (a,b) [pk, name: "pk_ab"]\n (b,a) [unique, name: "uq_ba"]\n }\n}'
    );
    expect(before.tables[0]!.uniqueConstraints).toHaveLength(2);
    expect(before.tables[0]!.columns.every((c) => !c.nullable)).toBe(true);
  });
  test("checks and mixed expression indexes retain their meaning", () => {
    roundTrip(
      'Table t {\n email text\n age int [check: `age >= 0`]\n indexes {\n (`lower(email)`,age) [name: "idx", unique]\n }\n checks {\n `age < 150` [name: "reasonable_age"]\n }\n}'
    );
  });
  test("quoted identifiers and composite foreign keys reparse", () => {
    roundTrip(
      'Table "parent rows" {\n a int\n "b b" int\n indexes {\n (a,"b b") [pk]\n }\n}\nTable children {\n a int\n b int\n}\nRef fk_pair: children.(a,b) > "parent rows".(a,"b b") [delete: cascade]'
    );
  });
  test("short and inline one-to-one relationships agree on FK holder", () => {
    const base = "Table users {\n id int [pk]\n}\n";
    for (const raw of [
      base +
        "Table profiles {\n uid int [unique]\n}\nRef: users.id - profiles.uid",
      base + "Table profiles {\n uid int [unique, ref: - users.id]\n}",
    ]) {
      const { before } = roundTrip(raw);
      expect(
        before.tables.find((t) => t.name === "profiles")!.foreignKeys[0]!
          .refTable.table
      ).toBe("users");
      expect(
        before.tables.find((t) => t.name === "users")!.foreignKeys
      ).toHaveLength(0);
    }
  });
  test("same-name enums in different namespaces stay distinct", () => {
    const { before } = roundTrip(
      "Enum auth.state {\n active\n}\nEnum billing.state {\n paid\n}\nTable t {\n a auth.state\n b billing.state\n}"
    );
    expect(before.tables[0]!.columns.map((c) => c.enumSchema)).toEqual([
      "auth",
      "billing",
    ]);
  });
  test("unknown columns remain present with actionable diagnostics", () => {
    const result = normalize(parseDbml("Table t {\n id int\n geo geometry\n}"));
    expect(result.errors[0]!.code).toBe("UNSUPPORTED_TYPE");
    expect(result.schema.tables[0]!.columns[1]!.type).toBe("unsupported");
    expect(renderDbml(result.schema)).toContain("geo geometry");
  });
  test("diff and scope checks catch native, constraint and FK-action changes", () => {
    const a =
      "Table t {\n a int [pk]\n b jsonb\n}\nTable child {\n a int\n}\nRef fk: child.a > t.a [delete: cascade]";
    const variants = [
      a.replace("jsonb", "json"),
      a.replace("cascade", "restrict"),
      a.replace("Ref fk:", "Ref renamed:"),
      a.replace("b jsonb", 'b jsonb\n indexes {\n a [name: "idx"]\n }'),
      a.replace("b jsonb", "b jsonb\n indexes {\n a [unique]\n }"),
      a.replace("b jsonb", "b jsonb\n checks {\n `a > 0`\n }"),
    ];
    for (const b of variants) {
      const diff = diffSchemas(canonical(a), canonical(b));
      expect(diff.isEmpty).toBe(false);
      expect(checkDiffScope(diff, []).inScope).toBe(false);
    }
  });
  test("declaration order is irrelevant, ordered index columns are not", () => {
    const a = "Table t {\n a int\n b int\n indexes {\n (a,b) [unique]\n }\n}";
    expect(canonicalDigest(canonical(a))).toBe(
      canonicalDigest(canonical(a.replace("a int\n b int", "b int\n a int")))
    );
    expect(
      diffSchemas(canonical(a), canonical(a.replace("(a,b)", "(b,a)"))).isEmpty
    ).toBe(false);
  });
  test("bounded inputs and unknown schema versions fail closed", () => {
    expect(() => parseDbml(" ".repeat(2_000_001))).toThrow("2 MB");
    expect(() =>
      renderDbml({
        ...canonical("Table t {\n a int\n}"),
        version: 99,
      } as never)
    ).toThrow("version");
  });
  test("target capabilities prohibit guessed dialect/ORM conversions", () => {
    const model = canonical(
      'Project p {\n database_type: "PostgreSQL"\n}\nTable t {\n id int [pk]\n}'
    );
    expect(exportCanonicalDbml(model, "postgres").ok).toBe(true);
    expect(
      assessSchemaTarget(model, { dialect: "mysql", format: "dbml" }).map(
        (d) => d.code
      )
    ).toContain("DIALECT_MISMATCH");
    for (const format of ["prisma", "drizzle", "sql"] as const)
      expect(
        assessSchemaTarget(model, { dialect: "postgres", format }).map(
          (d) => d.code
        )
      ).toContain("ADAPTER_NOT_IMPLEMENTED");
    expect(exportCanonicalDbml(canonical("Table t {\n a geometry\n}")).ok).toBe(
      false
    );
    const { version: _, ...legacy } = model;
    expect(
      assessSchemaTarget(legacy, { format: "dbml" }).map((d) => d.code)
    ).toContain("SCHEMA_VERSION");
  });
  test("structural validation rejects incomplete constraints, not valid SQL cycles", () => {
    const model = canonical(
      "Table a {\n id int [pk]\n b int\n}\nTable b {\n id int [pk]\n a int\n}\nRef: a.b > b.id\nRef: b.a > a.id"
    );
    expect(validateCanonicalStructure(model)).toHaveLength(0);
    model.tables[0]!.foreignKeys[0]!.refColumns = ["missing"];
    expect(validateCanonicalStructure(model).length).toBeGreaterThan(0);
    expect(exportCanonicalDbml(model).ok).toBe(false);
  });
  test("tampered index compatibility fields cannot hide behind expression metadata", () => {
    const model = canonical("Table t {\n a int\n indexes {\n a\n }\n}");
    model.tables[0]!.indexes[0]!.columns = ["different"];
    expect(exportCanonicalDbml(model).ok).toBe(false);
  });
  test("TablePartial numeric defaults retain original source precision", () => {
    const { output } = roundTrip(
      "TablePartial p {\n n decimal [default: 0.10000000000000000001]\n}\nTable t {\n ~p\n}"
    );
    expect(output).toContain("0.10000000000000000001");
  });
  test("round-trip fixture matrix covers types, defaults and identifier styles", () => {
    for (const type of [
      "int",
      "bigint",
      "decimal(30,9)",
      "varchar(255)",
      "jsonb",
      "timestamptz(3)",
      "char(8)",
      "smallint",
    ]) {
      for (const name of ["normal", "with space", "with.dot", "with-dash"]) {
        roundTrip(
          `Table ${JSON.stringify(name)} {\n id int [pk]\n ${JSON.stringify(name)} ${type}\n}`
        );
      }
    }
  });
  test("enum and dialect changes cannot bypass change-scope approval", () => {
    const raw =
      "Enum state {\n active\n}\nTable t {\n id int [pk]\n s state\n}";
    const diff = diffSchemas(
      canonical(raw),
      canonical(raw.replace("active", "inactive"))
    );
    expect(diff.touchedTables.has("public.t")).toBe(true);
    expect(checkDiffScope(diff, ["public.t"]).inScope).toBe(false);
    expect(checkDiffScope(diff, ["public.t"], ["public.state"]).inScope).toBe(
      true
    );
    const dialectDiff = diffSchemas(
      canonical(raw),
      canonical('Project p {\n database_type: "MySQL"\n}\n' + raw)
    );
    expect(
      checkDiffScope(dialectDiff, ["public.t"], ["public.state"]).inScope
    ).toBe(false);
  });
  test("canonical snapshots are JSON-safe without precision changes", () => {
    const before = canonical(
      "Table t {\n n decimal [default: 0.00000000000000000001]\n}"
    );
    const decoded = JSON.parse(JSON.stringify(before));
    expect(canonicalDigest(decoded)).toBe(canonicalDigest(before));
    expect(renderDbml(decoded)).toContain("0.00000000000000000001");
  });
});
