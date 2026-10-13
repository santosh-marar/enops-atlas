import { expect, test } from "bun:test";
import { generateDbmlFromPlan } from "../ai-workflow/generate-dbml";
import { mergeDbml, splitDbml } from "../ai-workflow/merge-dbml";
import type { SchemaModel } from "../model";

const SCHEMA = `Table users {
  id int [pk]
  email varchar [unique, note: 'login {name}']
}

// orders belong to users
Table ecommerce.orders {
  id int [pk]
  user_id int [ref: > users.id]
}

Enum order_status {
  open
  paid
}

Table products {
  id int [pk]
  name varchar
}

Table tags {
  id int [pk]
}

Ref: ecommerce.orders.id > products.id
`;

test("splits a schema into its top-level blocks, ignoring braces in strings and comments", () => {
  const blocks = splitDbml(SCHEMA);
  expect(blocks.map((block) => block.key)).toEqual([
    "table:public.users",
    "table:ecommerce.orders",
    "enum:public.order_status",
    "table:public.products",
    "table:public.tags",
    "ref:Ref: ecommerce.orders.id > products.id",
  ]);
});

test("a changed table replaces its old version in place and nothing else moves", () => {
  const merged = mergeDbml(
    SCHEMA,
    "Table users {\n  id int [pk]\n  email varchar\n  phone varchar\n}"
  );
  const keys = splitDbml(merged ?? "").map((block) => block.key);
  expect(keys[0]).toBe("table:public.users");
  expect(keys).toHaveLength(6);
  expect(merged).toContain("phone varchar");
  expect(merged).not.toContain("login {name}");
  expect(merged).toContain("Table products");
});

test("a new table and a new Ref are added; a Ref already there is not repeated", () => {
  const merged = mergeDbml(
    SCHEMA,
    `Table reviews {
  id int [pk]
  product_id int
}
Ref: reviews.product_id > products.id
Ref: ecommerce.orders.id > products.id`
  );
  const keys = splitDbml(merged ?? "").map((block) => block.key);
  expect(keys.filter((key) => key.startsWith("ref:"))).toHaveLength(2);
  expect(keys).toContain("table:public.reviews");
});

test("an answer with nothing to merge gives null", () => {
  expect(mergeDbml(SCHEMA, "just some words")).toBeNull();
});

const PLAN = {
  decisions: [],
  entityName: "users",
  generationPrompt: "",
  id: "p",
  operationType: "modify" as const,
  originalPrompt: "add a phone to users",
  tables: [{ isNew: false, name: "users" }],
};

function modelReturning(answers: string[]) {
  const requests: { system?: string }[] = [];
  const model: SchemaModel = {
    generateObject: async <T>(request: { system?: string }) => {
      requests.push(request);
      const dbml = answers[Math.min(requests.length, answers.length) - 1];
      return { object: { dbml } as T };
    },
  };
  return { model, requests };
}

test("a change to a big schema asks for only the changed table, and keeps the rest", async () => {
  const { model, requests } = modelReturning([
    "Table users {\n  id int [pk]\n  email varchar\n  phone varchar\n}",
  ]);
  const result = await generateDbmlFromPlan({
    existingDbml: SCHEMA,
    model,
    plan: PLAN,
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.system).toContain("OUTPUT ONLY THE CHANGES");
  expect(result.valid).toBe(true);
  expect(result.dbml).toContain("phone");
  for (const table of ["orders", "products", "tags", "order_status"]) {
    expect(result.dbml).toContain(table);
  }
});

test("a patch that cannot be merged falls back to writing the whole schema", async () => {
  const whole = SCHEMA.replace(
    "email varchar [unique, note: 'login {name}']",
    "email varchar\n  phone varchar"
  );
  const { model, requests } = modelReturning([
    "no tables here",
    "still nothing",
    "nope",
    whole,
  ]);
  const result = await generateDbmlFromPlan({
    existingDbml: SCHEMA,
    model,
    plan: PLAN,
  });
  expect(requests).toHaveLength(4);
  expect(requests[3]?.system).toContain("OUTPUT THE COMPLETE UPDATED SCHEMA");
  expect(result.valid).toBe(true);
  expect(result.dbml).toContain("phone");
});

test("a small schema, or a rename, is still written whole", async () => {
  const small = "Table users {\n  id int [pk]\n}\n";
  const { model, requests } = modelReturning([small]);
  await generateDbmlFromPlan({ existingDbml: small, model, plan: PLAN });
  expect(requests[0]?.system).toContain("OUTPUT THE COMPLETE UPDATED SCHEMA");

  const second = modelReturning([SCHEMA]);
  await generateDbmlFromPlan({
    existingDbml: SCHEMA,
    model: second.model,
    plan: { ...PLAN, operationType: "rename" },
  });
  expect(second.requests[0]?.system).toContain("OUTPUT THE COMPLETE");
});
