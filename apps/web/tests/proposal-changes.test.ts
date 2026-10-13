import { describe, expect, test } from "bun:test";
import { dbmlBlocks, proposalChanges } from "../lib/proposal-changes";

const BEFORE = `Enum status {
  active
  closed
}

Table users {
  id int [pk]
  email varchar // a "quoted" { brace } in a comment
  Note: 'Has a } brace'
}

Table orders {
  id int [pk]
  user_id int
  indexes {
    user_id
  }
}

Table products {
  id int [pk]
}

Ref: orders.user_id > users.id
`;

describe("proposal changes", () => {
  test("lists only the changed tables, not the whole schema", () => {
    const after = BEFORE.replace(
      "  user_id int\n",
      "  user_id int\n  total decimal(10,2)\n"
    );
    const changes = proposalChanges(BEFORE, after);
    expect(changes.map((c) => [c.kind, c.name])).toEqual([
      ["changed", "orders"],
    ]);
    expect(changes[0]?.before).toContain("Table orders {");
    expect(changes[0]?.after).toContain("total decimal(10,2)");
    // The table's Ref comes with it; other tables do not.
    expect(changes[0]?.after).toContain("Ref: orders.user_id > users.id");
    expect(changes[0]?.after).not.toContain("Table users");
  });

  test("a whole-schema rewrite that only reformats shows just the real change", () => {
    const rewritten = `Enum status {
  active
  closed
}
Table "public"."users" {
  "id" int [pk]
  "email" varchar
  Note: 'Has a } brace'
}
Table orders {
  id int [pk]
  user_id int
  indexes {
    user_id
  }
}
Table products {
  id int [pk]
  name text
}
Ref: orders.user_id > users.id`;
    expect(
      proposalChanges(BEFORE, rewritten).map((c) => [c.kind, c.name])
    ).toEqual([["changed", "products"]]);
  });

  test("added and removed tables and enums show one side only", () => {
    const after = `${BEFORE.replace(
      /Table products \{\n {2}id int \[pk\]\n\}\n/,
      ""
    )}
Table reviews {
  id int [pk]
}

Enum priority {
  low
  high
}
`;
    const changes = proposalChanges(BEFORE, after);
    expect(changes.map((c) => [c.kind, c.type, c.name])).toEqual([
      ["added", "table", "reviews"],
      ["removed", "table", "products"],
      ["added", "enum", "priority"],
    ]);
    expect(changes[0]?.before).toBeUndefined();
    expect(changes[1]?.after).toBeUndefined();
    expect(changes[2]?.after).toContain("Enum priority");
  });

  test("blocks are found by name in any schema and quoting", () => {
    const blocks = dbmlBlocks(
      `Table "billing"."invoices" as I {\n  id int\n}\nTable shop.items [headercolor: #fff] {\n  id int\n}\nRef fk {\n  shop.items.id > billing.invoices.id\n}`
    );
    expect(blocks.map((b) => [b.keyword, b.key])).toEqual([
      ["table", "billing.invoices"],
      ["table", "shop.items"],
      ["ref", ""],
    ]);
  });
});
