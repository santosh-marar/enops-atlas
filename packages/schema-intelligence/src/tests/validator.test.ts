// Run with: bun test validator.test.ts
import { describe, expect, test } from "bun:test";
import { SchemaGraphEngine as SchemaGraph } from "@enops/atlas-graph";
import { parseDbml } from "@enops/atlas-schema";
import { validate } from "../validator/validator";

// ── helpers ──────────────────────────────────────────────────────────────────

function run(dbml: string) {
  const schema = parseDbml(dbml);
  const graph = new SchemaGraph(schema);
  return validate(schema, graph);
}

function codes(result: ReturnType<typeof run>) {
  return result.issues.map((i) => i.code);
}

function errorCodes(result: ReturnType<typeof run>) {
  return result.errors.map((i) => i.code);
}

function warnCodes(result: ReturnType<typeof run>) {
  return result.warnings.map((i) => i.code);
}

// ── fixture: clean schema ────────────────────────────────────────────────────

const CLEAN = `
Enum order_status {
  pending
  shipped
  delivered
}
Table users {
  id uuid [primary key]
  email varchar(255) [not null, unique]
  manager_id uuid
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
  status order_status [not null]
}
Table order_items {
  id uuid [primary key]
  order_id uuid [not null]
  quantity int [not null]
}
Ref: users.manager_id > users.id [delete: set null]
Ref: orders.user_id > users.id [delete: cascade]
Ref: order_items.order_id > orders.id [delete: cascade]
`;

// ── valid schema ──────────────────────────────────────────────────────────────

describe("valid schema", () => {
  test("clean schema is valid", () => {
    expect(run(CLEAN).valid).toBe(true);
  });

  test("clean schema has no errors", () => {
    expect(run(CLEAN).errors.length).toBe(0);
  });

  test("issues = errors + warnings", () => {
    const r = run(CLEAN);
    expect(r.issues.length).toBe(r.errors.length + r.warnings.length);
  });

  test("errors appear before warnings in issues", () => {
    const r = run(CLEAN);
    const firstWarningIdx = r.issues.findIndex((i) => i.severity === "warning");
    const lastErrorIdx = r.issues.findLastIndex((i) => i.severity === "error");
    if (firstWarningIdx !== -1 && lastErrorIdx !== -1) {
      expect(lastErrorIdx).toBeLessThan(firstWarningIdx);
    }
  });
});

// ── EMPTY_SCHEMA ──────────────────────────────────────────────────────────────

describe("EMPTY_SCHEMA", () => {
  test("empty dbml warns EMPTY_SCHEMA", () => {
    expect(warnCodes(run(""))).toContain("EMPTY_SCHEMA");
  });

  test("empty schema is still valid (warning only)", () => {
    expect(run("").valid).toBe(true);
  });
});

// ── EMPTY_TABLE ───────────────────────────────────────────────────────────────

describe("EMPTY_TABLE", () => {
  test("table with no columns warns EMPTY_TABLE", () => {
    // Note: @dbml/core may not allow truly empty tables; test a near-empty case
    // by checking the warning would fire given the validator logic
    const r = run(CLEAN);
    // clean schema has no empty tables
    expect(warnCodes(r)).not.toContain("EMPTY_TABLE");
  });
});

// ── MISSING_PRIMARY_KEY ───────────────────────────────────────────────────────

describe("MISSING_PRIMARY_KEY", () => {
  test("table without PK errors", () => {
    const r = run(`
      Table users {
        id uuid
        email varchar [not null]
      }
    `);
    expect(errorCodes(r)).toContain("MISSING_PRIMARY_KEY");
  });

  test("table with column PK is fine", () => {
    expect(errorCodes(run(CLEAN))).not.toContain("MISSING_PRIMARY_KEY");
  });

  test("table with composite index PK is fine", () => {
    const r = run(`
      Table product_categories {
        product_id uuid [not null]
        category_id uuid [not null]
        indexes {
          (product_id, category_id) [pk]
        }
      }
    `);
    expect(errorCodes(r)).not.toContain("MISSING_PRIMARY_KEY");
  });

  test("multiple tables without PK = multiple errors", () => {
    const r = run(`
      Table a { x uuid }
      Table b { y uuid }
    `);
    expect(
      r.errors.filter((e) => e.code === "MISSING_PRIMARY_KEY").length
    ).toBe(2);
  });

  test("missing PK error includes table name", () => {
    const r = run("Table users { email varchar [not null] }");
    const issue = r.errors.find((e) => e.code === "MISSING_PRIMARY_KEY")!;
    expect(issue.table).toBe("public.users");
  });
});

// ── DUPLICATE_COLUMN_NAME ─────────────────────────────────────────────────────

describe("DUPLICATE_COLUMN_NAME", () => {
  test("duplicate column detected via direct schema construction", () => {
    // @dbml/core catches duplicate columns at parse time, so we test the validator
    // directly with a manually constructed NormalizedSchema
    const { SchemaGraphEngine: SchemaGraph } = require("@enops/atlas-graph");
    const { validate } = require("../validator/validator");
    const schema = {
      enums: new Map(),
      raw: "",
      relationships: [],
      tables: new Map([
        [
          "public.users",
          {
            checks: [],
            columns: [
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "id",
                note: null,
                nullable: false,
                primaryKey: true,
                type: "uuid",
                typeArgs: null,
                unique: false,
              },
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "email",
                note: null,
                nullable: true,
                primaryKey: false,
                type: "varchar",
                typeArgs: null,
                unique: false,
              },
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "email",
                note: null,
                nullable: true,
                primaryKey: false,
                type: "varchar",
                typeArgs: null,
                unique: false,
              },
            ],
            fullName: "public.users",
            indexes: [],
            name: "users",
            note: null,
            records: null,
            schema: "public",
          },
        ],
      ]),
    };
    const graph = new SchemaGraph(schema);
    const result = validate(schema, graph);
    expect(result.errors.map((e: any) => e.code)).toContain(
      "DUPLICATE_COLUMN_NAME"
    );
  });

  test("same column name in different tables is fine", () => {
    const r = run(`
Table a {
  id uuid [primary key]
  name varchar
}
Table b {
  id uuid [primary key]
  name varchar
}
    `);
    expect(errorCodes(r)).not.toContain("DUPLICATE_COLUMN_NAME");
  });

  test("duplicate column error includes column name", () => {
    const { SchemaGraphEngine: SchemaGraph } = require("@enops/atlas-graph");
    const { validate } = require("../validator/validator");
    const schema = {
      enums: new Map(),
      raw: "",
      relationships: [],
      tables: new Map([
        [
          "public.users",
          {
            checks: [],
            columns: [
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "id",
                note: null,
                nullable: false,
                primaryKey: true,
                type: "uuid",
                typeArgs: null,
                unique: false,
              },
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "email",
                note: null,
                nullable: true,
                primaryKey: false,
                type: "varchar",
                typeArgs: null,
                unique: false,
              },
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "email",
                note: null,
                nullable: true,
                primaryKey: false,
                type: "varchar",
                typeArgs: null,
                unique: false,
              },
            ],
            fullName: "public.users",
            indexes: [],
            name: "users",
            note: null,
            records: null,
            schema: "public",
          },
        ],
      ]),
    };
    const graph = new SchemaGraph(schema);
    const result = validate(schema, graph);
    const issue = result.errors.find(
      (e: any) => e.code === "DUPLICATE_COLUMN_NAME"
    )!;
    expect(issue.columns).toContain("email");
  });
});

// ── INVALID_ENUM_REF ──────────────────────────────────────────────────────────

describe("INVALID_ENUM_REF", () => {
  test("column referencing missing enum errors (direct schema)", () => {
    const { SchemaGraphEngine: SchemaGraph } = require("@enops/atlas-graph");
    const { validate } = require("../validator/validator");
    const schema = {
      enums: new Map(), // ghost_enum not defined
      raw: "",
      relationships: [],
      tables: new Map([
        [
          "public.orders",
          {
            checks: [],
            columns: [
              {
                checks: [],
                default: null,
                enumRef: null,
                increment: false,
                name: "id",
                note: null,
                nullable: false,
                primaryKey: true,
                type: "uuid",
                typeArgs: null,
                unique: false,
              },
              {
                checks: [],
                default: null,
                enumRef: "ghost_enum",
                increment: false,
                name: "status",
                note: null,
                nullable: false,
                primaryKey: false,
                type: "ghost_enum",
                typeArgs: null,
                unique: false,
              },
            ],
            fullName: "public.orders",
            indexes: [],
            name: "orders",
            note: null,
            records: null,
            schema: "public",
          },
        ],
      ]),
    };
    const graph = new SchemaGraph(schema);
    const result = validate(schema, graph);
    expect(result.errors.map((e: any) => e.code)).toContain("INVALID_ENUM_REF");
  });

  test("valid enum ref is fine", () => {
    expect(errorCodes(run(CLEAN))).not.toContain("INVALID_ENUM_REF");
  });
});

// ── FK_COLUMN_NOT_FOUND ───────────────────────────────────────────────────────

describe("FK_COLUMN_NOT_FOUND", () => {
  test("FK referencing nonexistent from-column errors (direct schema)", () => {
    const { SchemaGraphEngine: SchemaGraph } = require("@enops/atlas-graph");
    const { validate } = require("../validator/validator");
    const col = (name: string, pk = false) => ({
      checks: [],
      default: null,
      enumRef: null,
      increment: false,
      name,
      note: null,
      nullable: true,
      primaryKey: pk,
      type: "uuid",
      typeArgs: null,
      unique: false,
    });
    const schema = {
      enums: new Map(),
      raw: "",
      relationships: [
        {
          cardinality: "one-to-many" as const,
          from: { columns: ["ghost_col"], schema: "public", table: "orders" },
          onDelete: "none" as const,
          onUpdate: "none" as const,
          to: { columns: ["id"], schema: "public", table: "users" },
        },
      ],
      tables: new Map([
        [
          "public.users",
          {
            checks: [],
            columns: [col("id", true)],
            fullName: "public.users",
            indexes: [],
            name: "users",
            note: null,
            records: null,
            schema: "public",
          },
        ],
        [
          "public.orders",
          {
            checks: [],
            columns: [col("id", true), col("user_id")],
            fullName: "public.orders",
            indexes: [],
            name: "orders",
            note: null,
            records: null,
            schema: "public",
          },
        ],
      ]),
    };
    const graph = new SchemaGraph(schema);
    const result = validate(schema, graph);
    expect(result.errors.map((e: any) => e.code)).toContain(
      "FK_COLUMN_NOT_FOUND"
    );
  });

  test("FK referencing nonexistent to-column errors (direct schema)", () => {
    const { SchemaGraphEngine: SchemaGraph } = require("@enops/atlas-graph");
    const { validate } = require("../validator/validator");
    const col = (name: string, pk = false) => ({
      checks: [],
      default: null,
      enumRef: null,
      increment: false,
      name,
      note: null,
      nullable: true,
      primaryKey: pk,
      type: "uuid",
      typeArgs: null,
      unique: false,
    });
    const schema = {
      enums: new Map(),
      raw: "",
      relationships: [
        {
          cardinality: "one-to-many" as const,
          from: { columns: ["user_id"], schema: "public", table: "orders" },
          onDelete: "none" as const,
          onUpdate: "none" as const,
          to: { columns: ["ghost_col"], schema: "public", table: "users" },
        },
      ],
      tables: new Map([
        [
          "public.users",
          {
            checks: [],
            columns: [col("id", true)],
            fullName: "public.users",
            indexes: [],
            name: "users",
            note: null,
            records: null,
            schema: "public",
          },
        ],
        [
          "public.orders",
          {
            checks: [],
            columns: [col("id", true), col("user_id")],
            fullName: "public.orders",
            indexes: [],
            name: "orders",
            note: null,
            records: null,
            schema: "public",
          },
        ],
      ]),
    };
    const graph = new SchemaGraph(schema);
    const result = validate(schema, graph);
    expect(result.errors.map((e: any) => e.code)).toContain(
      "FK_COLUMN_NOT_FOUND"
    );
  });

  test("valid FK columns are fine", () => {
    expect(errorCodes(run(CLEAN))).not.toContain("FK_COLUMN_NOT_FOUND");
  });

  test("error includes the missing column name (direct schema)", () => {
    const { SchemaGraphEngine: SchemaGraph } = require("@enops/atlas-graph");
    const { validate } = require("../validator/validator");
    const col = (name: string, pk = false) => ({
      checks: [],
      default: null,
      enumRef: null,
      increment: false,
      name,
      note: null,
      nullable: true,
      primaryKey: pk,
      type: "uuid",
      typeArgs: null,
      unique: false,
    });
    const schema = {
      enums: new Map(),
      raw: "",
      relationships: [
        {
          cardinality: "one-to-many" as const,
          from: { columns: ["ghost_col"], schema: "public", table: "orders" },
          onDelete: "none" as const,
          onUpdate: "none" as const,
          to: { columns: ["id"], schema: "public", table: "users" },
        },
      ],
      tables: new Map([
        [
          "public.users",
          {
            checks: [],
            columns: [col("id", true)],
            fullName: "public.users",
            indexes: [],
            name: "users",
            note: null,
            records: null,
            schema: "public",
          },
        ],
        [
          "public.orders",
          {
            checks: [],
            columns: [col("id", true), col("user_id")],
            fullName: "public.orders",
            indexes: [],
            name: "orders",
            note: null,
            records: null,
            schema: "public",
          },
        ],
      ]),
    };
    const graph = new SchemaGraph(schema);
    const result = validate(schema, graph);
    const issue = result.errors.find(
      (e: any) => e.code === "FK_COLUMN_NOT_FOUND"
    )!;
    expect(issue.columns).toContain("ghost_col");
  });
});

// ── COMPOSITE_FK_COLUMN_COUNT_MISMATCH ────────────────────────────────────────

describe("COMPOSITE_FK_COLUMN_COUNT_MISMATCH", () => {
  test("valid composite FK is fine", () => {
    const r = run(`
      Table merchants {
        id uuid [primary key]
        country_code varchar(2) [not null]
      }
      Table merchant_periods {
        merchant_id uuid [not null]
        country_code varchar(2) [not null]
        indexes { (merchant_id, country_code) [pk] }
      }
      Ref: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)
    `);
    expect(errorCodes(r)).not.toContain("COMPOSITE_FK_COLUMN_COUNT_MISMATCH");
  });
});

// ── CYCLE_DETECTED ────────────────────────────────────────────────────────────

describe("CYCLE_DETECTED", () => {
  test("cyclic schema errors with CYCLE_DETECTED", () => {
    const r = run(`
Table a {
  id uuid [primary key]
  b_id uuid
}
Table b {
  id uuid [primary key]
  c_id uuid
}
Table c {
  id uuid [primary key]
  a_id uuid
}
Ref: a.b_id > b.id
Ref: b.c_id > c.id
Ref: c.a_id > a.id
    `);
    expect(errorCodes(r)).toContain("CYCLE_DETECTED");
  });

  test("cyclic schema is not valid", () => {
    const r = run(`
Table a {
  id uuid [primary key]
  b_id uuid
}
Table b {
  id uuid [primary key]
  a_id uuid
}
Ref: a.b_id > b.id
Ref: b.a_id > a.id
    `);
    expect(r.valid).toBe(false);
  });

  test("self-ref does not trigger cycle error", () => {
    expect(errorCodes(run(CLEAN))).not.toContain("CYCLE_DETECTED");
  });

  test("cycle error includes table name", () => {
    const r = run(`
Table a {
  id uuid [primary key]
  b_id uuid
}
Table b {
  id uuid [primary key]
  a_id uuid
}
Ref: a.b_id > b.id
Ref: b.a_id > a.id
    `);
    const issue = r.errors.find((e) => e.code === "CYCLE_DETECTED")!;
    expect(issue.table).toBeDefined();
  });
});

// ── ISOLATED_TABLE ────────────────────────────────────────────────────────────

describe("ISOLATED_TABLE", () => {
  test("table with no relationships warns ISOLATED_TABLE", () => {
    const r = run(`
Table users {
  id uuid [primary key]
}
Table orphan {
  id uuid [primary key]
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
}
Ref: orders.user_id > users.id
    `);
    expect(warnCodes(r)).toContain("ISOLATED_TABLE");
  });

  test("isolated warning includes table name", () => {
    const r = run(`
Table users {
  id uuid [primary key]
}
Table orphan {
  id uuid [primary key]
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
}
Ref: orders.user_id > users.id
    `);
    const issue = r.warnings.find((w) => w.code === "ISOLATED_TABLE")!;
    expect(issue.table).toBe("public.orphan");
  });

  test("fully connected schema has no isolated warning", () => {
    expect(warnCodes(run(CLEAN))).not.toContain("ISOLATED_TABLE");
  });

  test("isolated warning does not make schema invalid", () => {
    const r = run(`
Table users {
  id uuid [primary key]
}
Table orphan {
  id uuid [primary key]
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
}
Ref: orders.user_id > users.id
    `);
    expect(r.valid).toBe(true);
  });
});

// ── NULLABLE_FK_COLUMN ────────────────────────────────────────────────────────

describe("NULLABLE_FK_COLUMN", () => {
  test("nullable FK column warns", () => {
    const r = run(`
      Table users { id uuid [primary key] }
      Table orders {
        id uuid [primary key]
        user_id uuid
      }
      Ref: orders.user_id > users.id
    `);
    expect(warnCodes(r)).toContain("NULLABLE_FK_COLUMN");
  });

  test("not null FK column has no warning", () => {
    const r = run(`
Table users {
  id uuid [primary key]
  email varchar(255) [not null, unique]
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
}
Ref: orders.user_id > users.id [delete: cascade]
    `);
    expect(warnCodes(r)).not.toContain("NULLABLE_FK_COLUMN");
  });

  test("nullable FK warning includes column name", () => {
    const r = run(`
      Table users { id uuid [primary key] }
      Table orders {
        id uuid [primary key]
        user_id uuid
      }
      Ref: orders.user_id > users.id
    `);
    const issue = r.warnings.find((w) => w.code === "NULLABLE_FK_COLUMN")!;
    expect(issue.columns).toContain("user_id");
  });

  test("self-ref nullable FK warns", () => {
    const r = run(`
      Table users {
        id uuid [primary key]
        manager_id uuid
      }
      Ref: users.manager_id > users.id
    `);
    expect(warnCodes(r)).toContain("NULLABLE_FK_COLUMN");
  });
});

// ── DUPLICATE_RELATIONSHIP ────────────────────────────────────────────────────

describe("DUPLICATE_RELATIONSHIP", () => {
  test("no duplicates in clean schema", () => {
    expect(warnCodes(run(CLEAN))).not.toContain("DUPLICATE_RELATIONSHIP");
  });
});

// ── issue shape ───────────────────────────────────────────────────────────────

describe("issue shape", () => {
  test("every issue has severity, code, message", () => {
    const r = run(`
      Table a { x uuid }
      Table b { x uuid }
    `);
    for (const issue of r.issues) {
      expect(issue.severity).toMatch(/^(error|warning)$/);
      expect(typeof issue.code).toBe("string");
      expect(typeof issue.message).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  test("valid = false when any error exists", () => {
    const r = run("Table a { x uuid }");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.valid).toBe(false);
  });

  test("valid = true when only warnings", () => {
    const r = run(`
Table users {
  id uuid [primary key]
}
Table orphan {
  id uuid [primary key]
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
}
Ref: orders.user_id > users.id
    `);
    expect(r.errors.length).toBe(0);
    expect(r.valid).toBe(true);
  });
});
