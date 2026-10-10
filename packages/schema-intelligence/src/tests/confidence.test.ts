import { describe, expect, it } from "bun:test";
import type {
  CanonicalColumn,
  CanonicalSchema,
  CanonicalTable,
} from "@enops/atlas-schema";
import { scoreSchema } from "../confidence/score";

// Fixtures — matching the REAL canonical/types.ts shapes
function makeCol(
  name: string,
  overrides: Partial<CanonicalColumn> = {}
): CanonicalColumn {
  return {
    autoIncrement: false,
    name,
    nullable: false,
    primaryKey: false,
    type: "string",
    unique: false,
    ...overrides,
  };
}

function makeTable(
  name: string,
  columns: CanonicalColumn[],
  overrides: Partial<CanonicalTable> = {}
): CanonicalTable {
  return {
    columns,
    foreignKeys: [],
    indexes: [],
    name,
    schema: "public",
    uniqueConstraints: [],
    ...overrides,
  };
}

function makeSchema(tables: CanonicalTable[]): CanonicalSchema {
  return { enums: [], tables };
}

function wellFormedUserTable(): CanonicalTable {
  return makeTable("users", [
    makeCol("id", { primaryKey: true, type: "uuid" }),
    makeCol("email", { unique: true }),
    makeCol("created_at", { type: "timestamp" }),
    makeCol("updated_at", { type: "timestamp" }),
    makeCol("deleted_at", { nullable: true, type: "timestamp" }),
  ]);
}

// Tests
describe("scoreSchema", () => {
  it("returns 0.5 for empty schema (tables is an array, check .length not .size)", () => {
    const schema = makeSchema([]);
    const result = scoreSchema(schema);
    expect(result.overall).toBe(0.5);
    expect(result.issues).toHaveLength(0);
  });

  it("scores a well-formed schema near 1.0", () => {
    const schema = makeSchema([wellFormedUserTable()]);
    const result = scoreSchema(schema);
    expect(result.overall).toBeGreaterThanOrEqual(0.9);
  });

  it("flags missing audit columns", () => {
    const table = makeTable("orders", [
      makeCol("id", { primaryKey: true, type: "uuid" }),
      makeCol("total", { type: "int" }),
      makeCol("status"),
    ]);
    const result = scoreSchema(makeSchema([table]));

    const issue = result.issues.find((i) => i.kind === "missing_audit_cols");
    expect(issue).toBeDefined();
    expect(issue!.tables).toContain("orders");
  });

  it("flags missing created_at when only updated_at present", () => {
    const table = makeTable("orders", [
      makeCol("id", { primaryKey: true, type: "uuid" }),
      makeCol("updated_at", { type: "timestamp" }),
    ]);
    const result = scoreSchema(makeSchema([table]));

    expect(
      result.issues.find((i) => i.kind === "missing_created_at")
    ).toBeDefined();
  });

  it("flags email column without unique constraint as warning", () => {
    const table = makeTable("users", [
      makeCol("id", { primaryKey: true, type: "uuid" }),
      makeCol("email"), // unique: false
      makeCol("created_at", { type: "timestamp" }),
      makeCol("updated_at", { type: "timestamp" }),
    ]);
    const result = scoreSchema(makeSchema([table]));

    const issue = result.issues.find((i) => i.kind === "missing_unique_email");
    expect(issue).toBeDefined();
    expect(issue!.isWarning).toBe(true);
  });

  it("does NOT flag email with column.unique = true", () => {
    const result = scoreSchema(makeSchema([wellFormedUserTable()]));
    expect(
      result.issues.find((i) => i.kind === "missing_unique_email")
    ).toBeUndefined();
  });

  it("does NOT flag email covered by a table-level uniqueConstraint", () => {
    const table = makeTable(
      "users",
      [
        makeCol("id", { primaryKey: true, type: "uuid" }),
        makeCol("email"),
        makeCol("created_at", { type: "timestamp" }),
        makeCol("updated_at", { type: "timestamp" }),
      ],
      { uniqueConstraints: [{ columns: ["email"], name: "uq_users_email" }] }
    );
    const result = scoreSchema(makeSchema([table]));
    expect(
      result.issues.find((i) => i.kind === "missing_unique_email")
    ).toBeUndefined();
  });

  it("flags status-like string column as enum_as_string", () => {
    const table = makeTable("orders", [
      makeCol("id", { primaryKey: true, type: "uuid" }),
      makeCol("status", { type: "string" }),
      makeCol("created_at", { type: "timestamp" }),
      makeCol("updated_at", { type: "timestamp" }),
    ]);
    const result = scoreSchema(makeSchema([table]));

    const issue = result.issues.find((i) => i.kind === "enum_as_string");
    expect(issue).toBeDefined();
    expect(issue!.tables).toContain("orders");
  });

  it("does NOT flag status column already typed as enum", () => {
    const table = makeTable("orders", [
      makeCol("id", { primaryKey: true, type: "uuid" }),
      makeCol("status", { enumName: "order_status", type: "enum" }),
      makeCol("created_at", { type: "timestamp" }),
      makeCol("updated_at", { type: "timestamp" }),
    ]);
    const result = scoreSchema(makeSchema([table]));
    expect(
      result.issues.find((i) => i.kind === "enum_as_string")
    ).toBeUndefined();
  });

  it("flags large table (8+ cols) with no indexes", () => {
    const cols = Array.from({ length: 9 }, (_, i) =>
      makeCol(
        i === 0 ? "id" : `col_${i}`,
        i === 0 ? { primaryKey: true, type: "uuid" } : {}
      )
    );
    const table = makeTable("big_table", cols);
    const result = scoreSchema(makeSchema([table]));
    expect(
      result.issues.find((i) => i.kind === "large_table_no_index")
    ).toBeDefined();
  });

  it("does NOT flag large table that has indexes", () => {
    const cols = Array.from({ length: 9 }, (_, i) =>
      makeCol(
        i === 0 ? "id" : `col_${i}`,
        i === 0 ? { primaryKey: true, type: "uuid" } : {}
      )
    );
    const table = makeTable("big_table", cols, {
      indexes: [{ columns: ["col_1"], name: "idx_col_1", type: "btree" }],
    });
    const result = scoreSchema(makeSchema([table]));
    expect(
      result.issues.find((i) => i.kind === "large_table_no_index")
    ).toBeUndefined();
  });

  it("flags FK column with no index (foreignKeys is PER-TABLE, not schema-level)", () => {
    const users = wellFormedUserTable();
    const posts = makeTable(
      "posts",
      [
        makeCol("id", { primaryKey: true, type: "uuid" }),
        makeCol("user_id", { type: "uuid" }),
        makeCol("created_at", { type: "timestamp" }),
        makeCol("updated_at", { type: "timestamp" }),
      ],
      {
        foreignKeys: [
          {
            cardinality: "one-to-many",
            columns: ["user_id"],
            onDelete: "none",
            onUpdate: "none",
            refColumns: ["id"],
            refTable: { schema: "public", table: "users" },
          },
        ],
      }
    );
    const result = scoreSchema(makeSchema([users, posts]));

    const issue = result.issues.find((i) => i.kind === "no_index_on_fk");
    expect(issue).toBeDefined();
    expect(issue!.isWarning).toBe(true);
    expect(issue!.tables).toContain("posts");
  });

  it("does NOT flag FK column that has an index", () => {
    const posts = makeTable(
      "posts",
      [
        makeCol("id", { primaryKey: true, type: "uuid" }),
        makeCol("user_id", { type: "uuid" }),
        makeCol("created_at", { type: "timestamp" }),
        makeCol("updated_at", { type: "timestamp" }),
      ],
      {
        foreignKeys: [
          {
            cardinality: "one-to-many",
            columns: ["user_id"],
            onDelete: "none",
            onUpdate: "none",
            refColumns: ["id"],
            refTable: { schema: "public", table: "users" },
          },
        ],
        indexes: [
          { columns: ["user_id"], name: "idx_posts_user_id", type: "btree" },
        ],
      }
    );
    const result = scoreSchema(makeSchema([wellFormedUserTable(), posts]));
    expect(
      result.issues.find((i) => i.kind === "no_index_on_fk")
    ).toBeUndefined();
  });

  it("does NOT flag FK column that IS the primary key", () => {
    // e.g. a one-to-one shared-PK pattern
    const profiles = makeTable(
      "profiles",
      [makeCol("user_id", { primaryKey: true, type: "uuid" })],
      {
        foreignKeys: [
          {
            cardinality: "one-to-one",
            columns: ["user_id"],
            onDelete: "none",
            onUpdate: "none",
            refColumns: ["id"],
            refTable: { schema: "public", table: "users" },
          },
        ],
      }
    );
    const result = scoreSchema(makeSchema([profiles]));
    expect(
      result.issues.find((i) => i.kind === "no_index_on_fk")
    ).toBeUndefined();
  });

  it("overall score decreases with more issues", () => {
    const good = scoreSchema(makeSchema([wellFormedUserTable()])).overall;
    const bad = scoreSchema(
      makeSchema([
        makeTable("orders", [
          makeCol("id", { primaryKey: true, type: "uuid" }),
        ]),
      ])
    ).overall;
    expect(good).toBeGreaterThan(bad);
  });

  it("overall score is clamped to [0, 1]", () => {
    const tables = Array.from({ length: 20 }, (_, i) =>
      makeTable(`tbl_${i}`, [makeCol("id", { primaryKey: true, type: "uuid" })])
    );
    const result = scoreSchema(makeSchema(tables));
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(1);
  });
});
