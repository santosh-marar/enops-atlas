import { describe, expect, test } from "bun:test";
import { analyzeMigrationSql } from "../src/migration-analysis";

describe("migration analysis", () => {
  test("flags destructive statements with reasons", () => {
    const analysis = analyzeMigrationSql(`
      CREATE TABLE "users" ("id" uuid PRIMARY KEY);
      ALTER TABLE "users" DROP COLUMN "email";
      DROP TABLE "legacy";
    `);
    expect(analysis.destructive).toBe(true);
    expect(analysis.statements).toBe(3);
    expect(analysis.findings.map((finding) => finding.reason)).toEqual([
      "drops a column",
      "drops a table",
    ]);
  });

  test("treats additive migrations as safe and ignores comments", () => {
    const analysis = analyzeMigrationSql(`
      -- DROP TABLE fake;
      CREATE TABLE "orders" ("id" uuid PRIMARY KEY);
      ALTER TABLE "orders" ADD COLUMN "total" numeric;
    `);
    expect(analysis.destructive).toBe(false);
    expect(analysis.findings).toEqual([]);
  });

  test("flags unqualified deletes and type changes", () => {
    expect(analyzeMigrationSql("DELETE FROM users;").destructive).toBe(true);
    expect(
      analyzeMigrationSql("DELETE FROM users WHERE id = 1;").destructive
    ).toBe(false);
    expect(
      analyzeMigrationSql(
        "ALTER TABLE users ALTER COLUMN email SET DATA TYPE text;"
      ).destructive
    ).toBe(true);
  });
});
