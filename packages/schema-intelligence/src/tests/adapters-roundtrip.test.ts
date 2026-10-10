import { describe, expect, test } from "bun:test";
import { parseDbml } from "@enops/atlas-schema";
import { drizzleToDbml } from "../adapters/drizzle";
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

  test("a real implicit many-to-many still asks for a join model", () => {
    expect(() =>
      prismaToDbml([
        [
          "schema.prisma",
          `${datasource}
model Post {
  id   Int   @id
  tags Tag[]
}

model Tag {
  id    Int    @id
  posts Post[]
}
`,
        ],
      ])
    ).toThrow("Implicit many-to-many");
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
