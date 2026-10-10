// Run with: bun test parser.test.ts
import { describe, expect, test } from "bun:test";
import { parseDbml } from "@enops/atlas-schema";

// fixture

const FULL = `
Enum order_status {
  pending [note: "Awaiting payment"]
  processing
  shipped
  delivered
  cancelled
}
Enum user_role {
  admin
  customer
  vendor
}
Table users {
  id uuid [primary key, default: \`gen_random_uuid()\`]
  email varchar(255) [unique, not null]
  name varchar(100)
  role user_role [not null, default: 'customer']
  is_active boolean [not null, default: true]
  login_count int [not null, default: 0]
  score float
  bio text [note: "User biography"]
  created_at timestamp [not null, default: \`now()\`]
  updated_at timestamp
  manager_id uuid
  indexes {
    email [unique, name: 'idx_users_email', type: hash]
    (name, role) [name: 'idx_users_name_role', type: btree]
    created_at
  }
  Note: "Stores user accounts"
}
Table products {
  id uuid [primary key, default: \`gen_random_uuid()\`]
  name varchar(255) [not null]
  price decimal(10,2) [not null]
  stock int [not null, default: 0]
  vendor_id uuid [not null]
}
Table orders {
  id uuid [primary key]
  user_id uuid [not null]
  status order_status [not null, default: 'pending']
  total decimal(12,2)
  created_at timestamp [default: \`now()\`]
}
Table order_items {
  id uuid [primary key]
  order_id uuid [not null]
  product_id uuid [not null]
  quantity int [not null, default: 1]
  unit_price decimal(10,2) [not null]
  indexes {
    (order_id, product_id) [unique, name: 'idx_orderitem_unique']
  }
}
Table categories {
  id uuid [primary key]
  name varchar [not null]
  parent_id uuid
}
Table product_categories {
  product_id uuid [not null]
  category_id uuid [not null]
  indexes {
    (product_id, category_id) [pk]
  }
}
Table employees {
  id uuid [primary key]
  age int
  wealth int
  debt int
  checks {
    \`age > 0\` [name: 'chk_positive_age']
    \`debt + wealth >= 0\`
  }
}
Table sessions {
  id int [primary key]
  name varchar
  records {
    1, 'Alice'
    2, 'Bob'
  }
}
Table merchants {
  id uuid [pk]
  country_code varchar(2) [not null]
}
Table merchant_periods {
  merchant_id uuid [not null]
  country_code varchar(2) [not null]
}
Ref: categories.parent_id > categories.id
Ref: orders.user_id > users.id [delete: cascade, update: no action]
Ref: products.vendor_id > users.id [delete: restrict]
Ref: order_items.order_id > orders.id [delete: cascade]
Ref: order_items.product_id > products.id [delete: restrict]
Ref: product_categories.product_id > products.id [delete: cascade]
Ref: product_categories.category_id > categories.id [delete: cascade]
Ref: users.manager_id > users.id [delete: set null]
Ref: merchant_periods.(merchant_id, country_code) > merchants.(id, country_code)
`;

// guard

describe("guard cases", () => {
  test("empty string", () => {
    const r = parseDbml("");
    expect(r.tables.size).toBe(0);
  });
  test("whitespace only", () => {
    const r = parseDbml("   \n");
    expect(r.tables.size).toBe(0);
  });
  test("invalid DBML throws", () => {
    expect(() => parseDbml("%%% bad")).toThrow("DBML parse error");
  });
  test("raw preserved", () => {
    const s = "Table t {\n  id uuid [pk]\n}";
    expect(parseDbml(s).raw).toBe(s);
  });
});

//  schema namespacing

describe("schema namespacing", () => {
  test("tables keyed by fullName public.X", () => {
    const r = parseDbml(FULL);
    expect(r.tables.has("public.users")).toBe(true);
    expect(r.tables.has("public.orders")).toBe(true);
  });
  test("schema defaults to public", () => {
    expect(parseDbml(FULL).tables.get("public.users")!.schema).toBe("public");
  });
  test("cross-schema tables", () => {
    const r = parseDbml(`
Table core.users {
  id uuid [pk]
}
Table core.posts {
  id uuid [pk]
  user_id uuid
}`);
    expect(r.tables.has("core.users")).toBe(true);
    expect(r.tables.get("core.users")!.schema).toBe("core");
  });
  test("fullName set correctly", () => {
    expect(parseDbml(FULL).tables.get("public.users")!.fullName).toBe(
      "public.users"
    );
  });
});

//  columns

describe("columns", () => {
  test("column count", () => {
    expect(parseDbml(FULL).tables.get("public.users")!.columns.length).toBe(11);
  });
  test("primaryKey", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "id")!.primaryKey
    ).toBe(true);
  });
  test("unique", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "email")!.unique
    ).toBe(true);
  });
  test("nullable=false on [not null]", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "email")!.nullable
    ).toBe(false);
  });
  test("nullable=true by default", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "score")!.nullable
    ).toBe(true);
  });
  test("column note", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "bio")!.note
    ).toBe("User biography");
  });
  test("no note = null", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "name")!.note
    ).toBeNull();
  });
  test("varchar(255) typeArgs", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "email")!.typeArgs
    ).toBe("255");
  });
  test("decimal(10,2) typeArgs", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.products")!
        .columns.find((c) => c.name === "price")!.typeArgs
    ).toBe("10,2");
  });
  test("no args = null", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "id")!.typeArgs
    ).toBeNull();
  });
});

//  defaults

describe("defaults", () => {
  test("expression: gen_random_uuid()", () => {
    const d = parseDbml(FULL)
      .tables.get("public.users")!
      .columns.find((c) => c.name === "id")!.default!;
    expect(d).toEqual({ type: "expression", value: "gen_random_uuid()" });
  });
  test("expression: now()", () => {
    const d = parseDbml(FULL)
      .tables.get("public.users")!
      .columns.find((c) => c.name === "created_at")!.default!;
    expect(d).toEqual({ type: "expression", value: "now()" });
  });
  test("string default", () => {
    const d = parseDbml(FULL)
      .tables.get("public.users")!
      .columns.find((c) => c.name === "role")!.default!;
    expect(d).toEqual({ type: "string", value: "customer" });
  });
  test("boolean default true", () => {
    const d = parseDbml(FULL)
      .tables.get("public.users")!
      .columns.find((c) => c.name === "is_active")!.default!;
    expect(d).toEqual({ type: "boolean", value: true });
  });
  test("number default 0", () => {
    const d = parseDbml(FULL)
      .tables.get("public.users")!
      .columns.find((c) => c.name === "login_count")!.default!;
    expect(d).toEqual({ literal: "0", type: "number", value: 0 });
  });
  test("no default = null", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "score")!.default
    ).toBeNull();
  });
});

//  enum refs

describe("enum column refs", () => {
  test("enumRef set for enum column", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.orders")!
        .columns.find((c) => c.name === "status")!.enumRef
    ).toBe("order_status");
  });
  test("enumRef null for normal column", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .columns.find((c) => c.name === "id")!.enumRef
    ).toBeNull();
  });
});

//  indexes

describe("indexes", () => {
  test("hash index type", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .indexes.find((i) => i.name === "idx_users_email")!.type
    ).toBe("hash");
  });
  test("btree index type", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .indexes.find((i) => i.name === "idx_users_name_role")!.type
    ).toBe("btree");
  });
  test("no type = null", () => {
    expect(
      parseDbml(FULL)
        .tables.get("public.users")!
        .indexes.find((i) => !i.name)!.type
    ).toBeNull();
  });
  test("composite unique index", () => {
    const i = parseDbml(FULL)
      .tables.get("public.order_items")!
      .indexes.find((i) => i.name === "idx_orderitem_unique")!;
    expect(i.unique).toBe(true);
    expect(i.columns.length).toBe(2);
  });
  test("pk index on junction table", () => {
    expect(
      parseDbml(FULL).tables.get("public.product_categories")!.indexes[0]!.pk
    ).toBe(true);
  });
  test("no indexes = []", () => {
    expect(parseDbml(FULL).tables.get("public.products")!.indexes).toEqual([]);
  });
});

//  checks

describe("checks", () => {
  test("table-level check with name", () => {
    const c = parseDbml(FULL)
      .tables.get("public.employees")!
      .checks.find((c) => c.name === "chk_positive_age")!;
    expect(c.expression).toBe("age > 0");
    expect(c.column).toBeNull();
  });
  test("table-level check without name", () => {
    const c = parseDbml(FULL)
      .tables.get("public.employees")!
      .checks.find((c) => !c.name)!;
    expect(c.expression).toBe("debt + wealth >= 0");
  });
  test("table has 2 checks", () => {
    expect(parseDbml(FULL).tables.get("public.employees")!.checks.length).toBe(
      2
    );
  });
  test("table with no checks = []", () => {
    expect(parseDbml(FULL).tables.get("public.users")!.checks).toEqual([]);
  });
  test("column-level checks", () => {
    const r = parseDbml(`
Table t {
  id uuid [pk]
  score int [check: \`score >= 0\`, check: \`score <= 100\`]
}`);
    const col = r.tables
      .get("public.t")!
      .columns.find((c) => c.name === "score")!;
    expect(col.checks.length).toBe(2);
    expect(col.checks[0]!.column).toBe("score");
    expect(col.checks[0]!.expression).toBe("score >= 0");
  });
});

//  records

describe("records", () => {
  test("records parsed correctly", () => {
    const rec = parseDbml(FULL).tables.get("public.sessions")!.records!;
    expect(rec.columns.length).toBe(2);
    expect(rec.rows.length).toBe(2);
    expect(rec.rows[0]![0]!.value).toBe(1);
    expect(rec.rows[0]![1]!.value).toBe("Alice");
  });
  test("no records = null", () => {
    expect(parseDbml(FULL).tables.get("public.users")!.records).toBeNull();
  });
});

//  enums

describe("enums", () => {
  test("enums keyed by fullName", () => {
    const r = parseDbml(FULL);
    expect(r.enums.has("public.order_status")).toBe(true);
    expect(r.enums.has("public.user_role")).toBe(true);
  });
  test("enum values order", () => {
    const vals = parseDbml(FULL)
      .enums.get("public.order_status")!
      .values.map((v) => v.name);
    expect(vals).toEqual([
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ]);
  });
  test("enum value note", () => {
    expect(
      parseDbml(FULL)
        .enums.get("public.order_status")!
        .values.find((v) => v.name === "pending")!.note
    ).toBe("Awaiting payment");
  });
  test("enum value no note = null", () => {
    expect(
      parseDbml(FULL)
        .enums.get("public.order_status")!
        .values.find((v) => v.name === "shipped")!.note
    ).toBeNull();
  });
});

//  relationships

describe("relationships", () => {
  test("total refs", () => {
    expect(parseDbml(FULL).relationships.length).toBe(9);
  });
  test("one-to-many", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "orders" && r.from.columns[0] === "user_id"
    )!;
    expect(rel.cardinality).toBe("one-to-many");
    expect(rel.to.table).toBe("users");
  });
  test("self-ref", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "categories" && r.to.table === "categories"
    )!;
    expect(rel.from.columns[0]).toBe("parent_id");
  });
  test("composite FK columns", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "merchant_periods"
    )!;
    expect(rel.from.columns).toEqual(["merchant_id", "country_code"]);
    expect(rel.to.columns).toEqual(["id", "country_code"]);
  });
  test("onDelete cascade", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "orders" && r.from.columns[0] === "user_id"
    )!;
    expect(rel.onDelete).toBe("cascade");
  });
  test("onUpdate no action", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "orders" && r.from.columns[0] === "user_id"
    )!;
    expect(rel.onUpdate).toBe("no action");
  });
  test("onDelete set null", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "users" && r.from.columns[0] === "manager_id"
    )!;
    expect(rel.onDelete).toBe("set null");
  });
  test("no action clause = none", () => {
    const rel = parseDbml(FULL).relationships.find(
      (r) => r.from.table === "categories"
    )!;
    expect(rel.onDelete).toBe("none");
    expect(rel.onUpdate).toBe("none");
  });
});

//  edge cases

describe("edge cases", () => {
  test("one-to-one ref", () => {
    const r = parseDbml(`
Table users {
  id uuid [primary key]
}
Table profiles {
  id uuid [primary key]
  user_id uuid
}
Ref: profiles.user_id - users.id`);
    expect(r.relationships[0]!.cardinality).toBe("one-to-one");
  });
  test("many-to-many <> symbol", () => {
    const r = parseDbml(`
Table authors {
  id uuid [pk]
  name varchar [not null]
}
Table books {
  id uuid [pk]
  title varchar [not null]
}
Ref: authors.id <> books.id`);
    expect(r.relationships[0]!.cardinality).toBe("many-to-many");
  });
  test("TablePartial expanded", () => {
    const r = parseDbml(`
TablePartial base {
  id uuid [pk]
  created_at timestamp [not null]
}
Table users {
  ~base
  email varchar(255) [not null]
}`);
    const cols = r.tables.get("public.users")!.columns.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("created_at");
    expect(cols).toContain("email");
  });
  test("multiple self-refs", () => {
    const r = parseDbml(`
Table users {
  id uuid [pk]
  manager_id uuid
  created_by uuid
}
Ref: users.manager_id > users.id
Ref: users.created_by > users.id`);
    expect(r.relationships.length).toBe(2);
  });
  test("duplicate ref throws", () => {
    expect(() =>
      parseDbml(`
Table users {
  id uuid [pk]
}
Table orders {
  id uuid [pk]
  user_id uuid
}
Ref: orders.user_id > users.id
Ref: orders.user_id > users.id`)
    ).toThrow("DBML parse error");
  });
});
