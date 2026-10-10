import { expect, test } from "bun:test";
import { SAMPLE_DBML } from "../data/sample-dbml";
import { validateDBML } from "../validation/dbml-editor";

test("the sample schema is valid", async () => {
  const result = await validateDBML(SAMPLE_DBML);
  expect(result.isValid).toBe(true);
});

test("a syntax error is reported with its line", async () => {
  const result = await validateDBML("Table users {\n  id int [pk\n}");
  expect(result.isValid).toBe(false);
  expect(result.errors[0]?.severity).toBe("error");
  expect(result.errors[0]?.line).toBeGreaterThan(0);
});

test("a table without a primary key is an error on its own line", async () => {
  const result = await validateDBML(
    "Table users {\n  id int [pk]\n}\n\nTable logs {\n  message text\n}\n"
  );
  const issue = result.errors.find((e) => e.code === "MISSING_PRIMARY_KEY");
  expect(issue?.severity).toBe("error");
  expect(issue?.line).toBe(5);
  // rule problems never block the diagram from updating
  expect(result.isValid).toBe(true);
});

test("a table without relations is a warning", async () => {
  const result = await validateDBML(
    "Table users {\n  id int [pk]\n}\n\nTable posts {\n  id int [pk]\n}\n"
  );
  const issue = result.errors.find((e) => e.code === "ISOLATED_TABLE");
  expect(issue?.severity).toBe("warning");
});

test("a reversed foreign key is a warning", async () => {
  const result = await validateDBML(
    "Table users {\n  id int [pk]\n}\n\nTable posts {\n  id int [pk]\n  user_id int\n}\n\nRef: users.id > posts.user_id\n"
  );
  const flagged = result.errors.filter((e) => e.severity === "warning");
  expect(
    flagged.some(
      (e) =>
        e.code === "fk_name_mismatch" || e.code === "target_not_pk_or_unique"
    )
  ).toBe(true);
});

test("empty DBML is invalid", async () => {
  const result = await validateDBML("   ");
  expect(result.isValid).toBe(false);
});
