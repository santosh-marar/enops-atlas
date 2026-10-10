import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";

// ── helpers ───────────────────────────────────────────────────────────────────
// Why helper functions instead of inline schema.tables[0]?
// Array index access returns T | undefined in strict mode.
// These helpers assert-and-throw with a clear message so failures
// are "table 'user' not found" not "Cannot read property of undefined".

function getTable(
  schema: ReturnType<typeof normalize>["schema"],
  name: string
) {
  const t = schema.tables.find((t) => t.name === name);
  if (!t) throw new Error(`Table "${name}" not found in schema`);
  return t;
}

function getColumn(
  schema: ReturnType<typeof normalize>["schema"],
  table: string,
  col: string
) {
  const c = getTable(schema, table).columns.find((c) => c.name === col);
  if (!c) throw new Error(`Column "${table}.${col}" not found`);
  return c;
}

function getFk(
  schema: ReturnType<typeof normalize>["schema"],
  table: string,
  index = 0
) {
  const fks = getTable(schema, table).foreignKeys;
  const fk = fks[index];
  if (!fk) throw new Error(`FK[${index}] not found on table "${table}"`);
  return fk;
}

function getConstraint(
  schema: ReturnType<typeof normalize>["schema"],
  table: string,
  index = 0
) {
  const uqs = getTable(schema, table).uniqueConstraints;
  const uq = uqs[index];
  if (!uq)
    throw new Error(`UniqueConstraint[${index}] not found on table "${table}"`);
  return uq;
}

function getIndex(
  schema: ReturnType<typeof normalize>["schema"],
  table: string,
  index = 0
) {
  const idxs = getTable(schema, table).indexes;
  const idx = idxs[index];
  if (!idx) throw new Error(`Index[${index}] not found on table "${table}"`);
  return idx;
}

function getPk(schema: ReturnType<typeof normalize>["schema"], table: string) {
  const pk = getTable(schema, table).primaryKey;
  if (!pk) throw new Error(`No primary key on table "${table}"`);
  return pk;
}

// ── type mapping ──────────────────────────────────────────────────────────────

describe("type mapping", () => {
  test("varchar with length -> string with length", () => {
    const { schema, errors } = normalize(
      parseDbml("Table t {\n  id uuid [pk]\n  name varchar(255)\n}")
    );
    const col = getColumn(schema, "t", "name");
    expect(col.type).toBe("string");
    expect(col.length).toBe(255);
    expect(errors).toHaveLength(0);
  });

  test("REGRESSION: handles @dbml/core versions that embed args in type_name AND args redundantly", () => {
    // @dbml/core 8.4.0 returns type:"varchar(255)" AND typeArgs:"255" — both set.
    // Earlier 8.2.5 (per original parser.ts comments) may only set one.
    // This test locks in that both shapes work so a dep bump can't silently
    // drop varchar columns from normalized output.
    const { schema, errors } = normalize(
      parseDbml("Table t {\n  id uuid [pk]\n  name varchar(255) [not null]\n}")
    );
    expect(errors).toHaveLength(0);
    expect(schema.tables[0]!.columns.map((c) => c.name)).toContain("name");
  });

  test("decimal with precision/scale", () => {
    const { schema, errors } = normalize(
      parseDbml("Table t {\n  id uuid [pk]\n  price decimal(10,2)\n}")
    );
    const col = getColumn(schema, "t", "price");
    expect(col.type).toBe("decimal");
    expect(col.precision).toEqual([10, 2]);
    expect(errors).toHaveLength(0);
  });

  test("unsupported type produces structured error, not a throw", () => {
    expect(() =>
      normalize(parseDbml("Table t {\n  id uuid [pk]\n  loc point\n}"))
    ).not.toThrow();
    const { errors } = normalize(
      parseDbml("Table t {\n  id uuid [pk]\n  loc point\n}")
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("UNSUPPORTED_TYPE");
    expect(errors[0]!.column).toBe("loc");
  });

  test("sibling columns still normalize despite one unsupported type", () => {
    const { schema } = normalize(
      parseDbml(
        "Table t {\n  id uuid [pk]\n  loc point\n  label varchar(50)\n}"
      )
    );
    const names = schema.tables[0]!.columns.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("label");
    expect(names).toContain("loc");
    expect(getColumn(schema, "t", "loc").type).toBe("unsupported");
  });

  test("enum column bypasses type map entirely", () => {
    const { schema, errors } = normalize(
      parseDbml(
        "Enum status { pending\n active }\nTable t {\n  id uuid [pk]\n  s status\n}"
      )
    );
    const col = getColumn(schema, "t", "s");
    expect(col.type).toBe("enum");
    expect(col.enumName).toBe("status");
    expect(errors).toHaveLength(0);
  });
});

// ── primary keys ──────────────────────────────────────────────────────────────

describe("primary keys", () => {
  test("single column PK", () => {
    const { schema } = normalize(parseDbml("Table t {\n  id uuid [pk]\n}"));
    expect(getPk(schema, "t").columns).toEqual(["id"]);
  });

  test("composite PK via index", () => {
    const { schema } = normalize(
      parseDbml(
        "Table t {\n  a uuid [not null]\n  b uuid [not null]\n  indexes {\n    (a, b) [pk]\n  }\n}"
      )
    );
    expect(getPk(schema, "t").columns).toEqual(["a", "b"]);
  });
});

// ── foreign keys ──────────────────────────────────────────────────────────────

describe("foreign keys", () => {
  test("FK references fullName (schema-qualified) to avoid cross-schema ambiguity", () => {
    const dbml =
      "Table user {\n  id uuid [pk]\n}\nTable post {\n  id uuid [pk]\n  user_id uuid\n}\nRef: post.user_id > user.id";
    const { schema } = normalize(parseDbml(dbml));
    const fk = getFk(schema, "post");
    expect(fk.refTable).toEqual({ schema: "public", table: "user" });
    expect(fk.cardinality).toBe("one-to-many");
  });
});

// ── unique constraints ────────────────────────────────────────────────────────

describe("unique constraints", () => {
  test("multi-column unique index -> uniqueConstraints array", () => {
    const { schema } = normalize(
      parseDbml(
        `Table t {\n  id uuid [pk]\n  a varchar\n  b varchar\n  indexes { (a, b) [unique, name: 'uq_a_b'] }\n}`
      )
    );
    expect(getTable(schema, "t").uniqueConstraints).toHaveLength(1);
    const uq = getConstraint(schema, "t");
    expect(uq.columns).toEqual(["a", "b"]);
    expect(uq.name).toBe("uq_a_b");
  });

  test("unnamed multi-column unique stays unnamed rather than inventing a DB constraint name", () => {
    const { schema } = normalize(
      parseDbml(
        "Table order_item {\n  id uuid [pk]\n  order_id uuid\n  product_id uuid\n  indexes { (order_id, product_id) [unique] }\n}"
      )
    );
    expect(getConstraint(schema, "order_item").name).toBeNull();
  });

  test("single-column unique stays on column.unique, not uniqueConstraints", () => {
    const { schema } = normalize(
      parseDbml("Table t {\n  id uuid [pk]\n  email varchar [unique]\n}")
    );
    expect(getColumn(schema, "t", "email").unique).toBe(true);
    expect(getTable(schema, "t").uniqueConstraints).toHaveLength(0);
  });

  test("empty uniqueConstraints when no multi-column uniques", () => {
    const { schema } = normalize(parseDbml("Table t {\n  id uuid [pk]\n}"));
    expect(getTable(schema, "t").uniqueConstraints).toHaveLength(0);
  });
});

// ── indexes ───────────────────────────────────────────────────────────────────

describe("indexes", () => {
  test("non-unique non-pk index captured", () => {
    const { schema } = normalize(
      parseDbml(
        `Table t {\n  id uuid [pk]\n  email varchar\n  indexes { email [name: 'idx_email', type: hash] }\n}`
      )
    );
    expect(getTable(schema, "t").indexes).toHaveLength(1);
    const idx = getIndex(schema, "t");
    expect(idx.name).toBe("idx_email");
    expect(idx.type).toBe("hash");
    expect(idx.columns).toEqual(["email"]);
  });

  test("pk indexes NOT in indexes array (they're in primaryKey)", () => {
    const { schema } = normalize(
      parseDbml("Table t {\n  a uuid\n  b uuid\n  indexes { (a, b) [pk] }\n}")
    );
    expect(getTable(schema, "t").indexes).toHaveLength(0);
    expect(getPk(schema, "t").columns).toEqual(["a", "b"]);
  });

  test("unique indexes NOT in indexes array (they're in uniqueConstraints)", () => {
    const { schema } = normalize(
      parseDbml(
        "Table t {\n  id uuid [pk]\n  a varchar\n  b varchar\n  indexes { (a,b) [unique] }\n}"
      )
    );
    expect(getTable(schema, "t").indexes).toHaveLength(0);
    expect(getTable(schema, "t").uniqueConstraints).toHaveLength(1);
  });

  test("unnamed index has null name", () => {
    const { schema } = normalize(
      parseDbml(
        "Table t {\n  id uuid [pk]\n  created_at timestamp\n  indexes { created_at }\n}"
      )
    );
    expect(getIndex(schema, "t").name === null).toBe(true);
  });

  test("empty indexes when no performance indexes", () => {
    const { schema } = normalize(parseDbml("Table t {\n  id uuid [pk]\n}"));
    expect(getTable(schema, "t").indexes).toHaveLength(0);
  });
});
