import { expect, test } from "bun:test";
import { SAMPLE_DBML } from "../data/sample-dbml";
import { scoreDbml } from "../lib/quality";

const TIDY = `
Table users {
  id int [pk]
  email varchar [unique, not null]
  created_at timestamp
  updated_at timestamp
}
`;

test("a tidy table scores higher than one with no timestamps", () => {
  const tidy = scoreDbml(TIDY);
  const bare = scoreDbml("Table users {\n  id int [pk]\n  email varchar\n}\n");
  expect(tidy).not.toBeNull();
  expect(bare).not.toBeNull();
  expect(tidy!.percent).toBeGreaterThan(bare!.percent);
});

test("the score is between 0 and 100 and issues explain themselves", () => {
  const report = scoreDbml(SAMPLE_DBML);
  expect(report).not.toBeNull();
  expect(report!.percent).toBeGreaterThanOrEqual(0);
  expect(report!.percent).toBeLessThanOrEqual(100);
  for (const issue of report!.issues) {
    expect(issue.suggestion.length).toBeGreaterThan(0);
    expect(issue.tables.length).toBeGreaterThan(0);
  }
});

test("empty or broken DBML gives no report instead of crashing", () => {
  expect(scoreDbml("")).toBeNull();
  expect(scoreDbml("Table t { id ")).toBeNull();
});

test("the same schema always gets the same score", () => {
  expect(scoreDbml(SAMPLE_DBML)).toEqual(scoreDbml(SAMPLE_DBML));
});
