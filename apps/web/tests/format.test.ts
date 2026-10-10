import { expect, test } from "bun:test";
import { formatDbml } from "../components/custom/format-button";
import { SAMPLE_DBML } from "../data/sample-dbml";
import { analyzeDbml } from "../lib/atlas";

test("formatting keeps the same schema", () => {
  const result = formatDbml(SAMPLE_DBML);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const before = analyzeDbml(SAMPLE_DBML).canonical;
  const after = analyzeDbml(result.dbml).canonical;
  expect(after.tables.map((t) => `${t.schema}.${t.name}`).sort()).toEqual(
    before.tables.map((t) => `${t.schema}.${t.name}`).sort()
  );
  expect(after.tables.flatMap((t) => t.foreignKeys).length).toBe(
    before.tables.flatMap((t) => t.foreignKeys).length
  );
});

test("formatting twice changes nothing", () => {
  const first = formatDbml(SAMPLE_DBML);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const second = formatDbml(first.dbml);
  expect(second.ok && second.dbml).toBe(first.dbml);
});

test("comments are dropped", () => {
  const result = formatDbml("// hello\nTable t {\n  id int [pk]\n}\n");
  expect(result.ok && result.dbml.includes("hello")).toBe(false);
});

test("broken or empty DBML is refused with a message", () => {
  expect(formatDbml("").ok).toBe(false);
  const broken = formatDbml("Table t { id ");
  expect(broken.ok).toBe(false);
});
