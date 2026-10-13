import { describe, expect, test } from "bun:test";
import { parseDbml } from "@enops/atlas-schema";
import { drizzleToDbml } from "../adapters/drizzle/to-dbml";
import { prismaToDbml } from "../adapters/prisma";

const datasource =
  'datasource db {\n provider = "postgresql"\n url = env("NEVER_READ_THIS_URL")\n}\n';

describe("prisma reader", () => {
  test("two models that reference each other twice are not many-to-many", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        `${datasource}
model Team {
  id       Int    @id
  members  User[] @relation("member")
  managers User[] @relation("manager")
}

model User {
  id        Int  @id
  teamId    Int
  team      Team @relation("member", fields: [teamId], references: [id])
  managedId Int
  managed   Team @relation("manager", fields: [managedId], references: [id])
}
`,
      ],
    ]);
    expect(parseDbml(result.dbml).relationships).toHaveLength(2);
  });

  test("an implicit many-to-many becomes the join table Prisma creates for it", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        `${datasource}
model Post {
  id   Int   @id
  tags Tag[]
}

model Tag {
  id    String @id
  posts Post[]
}
`,
      ],
    ]);
    const parsed = parseDbml(result.dbml);
    const join = parsed.tables.get("public._PostToTag");
    expect(join?.columns.map((column) => column.name)).toEqual(["A", "B"]);
    // A points at the model that sorts first, B at the other, typed like their ids.
    expect(join?.columns.map((column) => column.type)).toEqual([
      "integer",
      "text",
    ]);
    expect(join?.indexes.map((index) => index.columns)).toEqual([
      ["A", "B"],
      ["B"],
    ]);
    expect(parsed.relationships).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("_PostToTag");
    // Each side is listed on both models but the table is written once.
    expect(
      [...parsed.tables.keys()].filter((k) => k.includes("_PostToTag"))
    ).toHaveLength(1);
  });

  test("a named implicit many-to-many uses the relation's name, and a self-relation gets one table", () => {
    const result = prismaToDbml([
      [
        "schema.prisma",
        `${datasource}
model User {
  id         Int    @id
  followers  User[] @relation("follows")
  following  User[] @relation("follows")
  groups     Group[] @relation("membership")
}

model Group {
  id      Int    @id
  members User[] @relation("membership")
}
`,
      ],
    ]);
    const tables = [...parseDbml(result.dbml).tables.keys()];
    expect(tables).toContain("public._follows");
    expect(tables).toContain("public._membership");
    expect(tables.filter((name) => name.startsWith("public._"))).toHaveLength(
      2
    );
  });
});

describe("drizzle reader", () => {
  const source = `import { integer, pgSchema, text } from "drizzle-orm/pg-core";

const sales = pgSchema("sales");
export const status = sales.enum("order_status", ["open", "done"]);
export const customers = sales.table("customers", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});
export const orders = sales.table("orders", {
  id: integer("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "cascade",
  }),
  status: status("status"),
});
`;

  test("pgSchema tables and enums keep their schema", () => {
    const parsed = parseDbml(
      drizzleToDbml([{ content: source, path: "schema.ts" }]).dbml
    );
    expect([...parsed.tables.keys()].sort()).toEqual([
      "sales.customers",
      "sales.orders",
    ]);
    expect(parsed.enums.has("sales.order_status")).toBe(true);
    expect(parsed.relationships[0]?.onDelete).toBe("cascade");
  });

  test("a schema wrapped in a function is still refused", () => {
    expect(() =>
      drizzleToDbml([
        {
          content: `import { pgSchema } from "drizzle-orm/pg-core";
const make = () => pgSchema("x").table("t", {});
`,
          path: "schema.ts",
        },
      ])
    ).toThrow();
  });
});
