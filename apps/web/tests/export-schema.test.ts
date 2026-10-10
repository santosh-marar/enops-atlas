import { expect, test } from "bun:test";
import {
  canonicalDbmlText,
  canonicalSchemaJson,
} from "../components/custom/toolbar/export/schema";
import { SAMPLE_DBML } from "../data/sample-dbml";

test("schema json contains every table with its columns", () => {
  const schema = JSON.parse(canonicalSchemaJson(SAMPLE_DBML));
  expect(schema.tables.length).toBe(10);
  for (const table of schema.tables) {
    expect(table.columns.length).toBeGreaterThan(0);
  }
});

test("canonical dbml parses back to the same tables", () => {
  const result = canonicalDbmlText(SAMPLE_DBML);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const again = JSON.parse(canonicalSchemaJson(result.dbml));
  expect(again.tables.length).toBe(10);
});
