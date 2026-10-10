import { describe, expect, it } from "bun:test";
import { dbmlToSql, sqlToDbml } from "../src";

const DBML = `
Table users {
  id int [pk]
  email varchar(255)
}
`;

describe("sql interop", () => {
  it("imports postgres DDL into DBML", () => {
    const dbml = sqlToDbml(
      "CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255));",
      "postgres"
    );
    expect(dbml).toContain('Table "users"');
  });

  it("imports mysql DDL into DBML", () => {
    const dbml = sqlToDbml(
      "CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(255), PRIMARY KEY (`id`));",
      "mysql"
    );
    expect(dbml).toContain('Table "users"');
  });

  it("exports DBML to postgres SQL", () => {
    expect(dbmlToSql(DBML, "postgres")).toContain('CREATE TABLE "users"');
  });

  it("exports DBML to mysql SQL", () => {
    expect(dbmlToSql(DBML, "mysql")).toContain("`users`");
  });

  it("reports import errors with context", () => {
    expect(() => sqlToDbml("this is not sql", "postgres")).toThrow(
      /SQL import error/
    );
  });

  it("reports export errors with context", () => {
    expect(() => dbmlToSql("Table broken { id", "postgres")).toThrow(
      /SQL export error/
    );
  });
});
