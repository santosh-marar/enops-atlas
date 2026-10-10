import { expect, test } from "bun:test";
import { SAMPLE_DBML } from "../data/sample-dbml";
import { exportProblems, generateCode, generateSeed } from "../lib/code-export";

test("the sample schema exports as sql, prisma and drizzle", () => {
  for (const format of ["sql", "prisma", "drizzle"] as const) {
    const result = generateCode(SAMPLE_DBML, format);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.code.length).toBeGreaterThan(100);
  }
});

test("generation is repeatable", () => {
  expect(generateCode(SAMPLE_DBML, "prisma")).toEqual(
    generateCode(SAMPLE_DBML, "prisma")
  );
});

test("a schema with seed records still exports", () => {
  const dbml = `
Table users {
  id int [pk]
  name varchar
}

records users(id, name) {
  1, 'a'
}
`;
  for (const format of ["sql", "prisma", "drizzle"] as const) {
    expect(generateCode(dbml, format).ok).toBe(true);
  }
});

test("an unsupported type gives a message and no code", () => {
  const result = generateCode(
    "Table g {\n  id int [pk]\n  loc geometry\n}\n",
    "prisma"
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.messages.join(" ")).toContain("geometry");
  }
});

test("other sql dialects still use the dbml exporter", () => {
  const result = generateCode(SAMPLE_DBML, "sql", "mysql");
  expect(result.ok).toBe(true);
});

test("problems are listed before opening a dialog", () => {
  expect(exportProblems(SAMPLE_DBML, "sql")).toEqual([]);
  expect(
    exportProblems("Table g {\n  id int [pk]\n  loc geometry\n}\n", "sql")
      .length
  ).toBeGreaterThan(0);
});

const SEEDED = `
Table users {
  id int [pk]
  name varchar
}

Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}

records posts(id, user_id) {
  1, 1
}

records users(id, name) {
  1, 'a'
}
`;

test("seed sql inserts parents before children", () => {
  const result = generateSeed(SEEDED);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.tablesSeeded).toEqual(["public.users", "public.posts"]);
  expect(result.sql.indexOf('"users"')).toBeLessThan(
    result.sql.indexOf('"posts"')
  );
});

test("a schema without records says there is nothing to seed", () => {
  const result = generateSeed("Table t {\n  id int [pk]\n}\n");
  expect(result.ok).toBe(false);
});
