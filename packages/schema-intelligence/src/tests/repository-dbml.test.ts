import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { directDbmlDigest } from "../direct-dbml";
import { extractRepositoryDbml } from "../repository-dbml";

describe("repository DBML extraction", () => {
  test("SQL defaults that upstream import would round are rejected", async () => {
    const root = await mkdtemp(join(tmpdir(), "enops-dbml-"));
    await writeFile(
      join(root, "schema.sql"),
      "CREATE TABLE t (n numeric DEFAULT 0.1000000000000000001);"
    );
    await expect(extractRepositoryDbml(root)).rejects.toThrow("precision loss");
  });
  test("imports PostgreSQL schema SQL as direct DBML", async () => {
    const root = await mkdtemp(join(tmpdir(), "enops-dbml-"));
    await writeFile(
      join(root, "schema.sql"),
      `
      CREATE TABLE users (id uuid PRIMARY KEY, email varchar(255) NOT NULL UNIQUE);
      CREATE TABLE posts (id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL);
    `
    );
    const result = await extractRepositoryDbml(root);
    expect(result?.format).toBe("postgres");
    expect(result?.sourcePaths).toEqual(["schema.sql"]);
    expect(result?.dbml).toContain('Table "users"');
    expect(result?.dbml).toContain('Table "posts"');
    expect(result?.digest).toHaveLength(64);
  });

  test("prefers explicit DBML over SQL migrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "enops-dbml-"));
    await mkdir(join(root, "migrations"));
    await writeFile(
      join(root, "schema.dbml"),
      "Table accounts {\n  id uuid [pk]\n}\n"
    );
    await writeFile(
      join(root, "migrations", "001.sql"),
      "CREATE TABLE ignored (id int);"
    );
    const result = await extractRepositoryDbml(root);
    expect(result?.format).toBe("dbml");
    expect(result?.sourcePaths).toEqual(["schema.dbml"]);
    expect(result?.dbml).toContain("Table accounts");
    expect(result?.dbml).not.toContain("ignored");
  });

  test("normalization makes formatting-only changes equal", () => {
    expect(directDbmlDigest("Table users {\n  id int [pk]\n}")).toBe(
      directDbmlDigest("Table users {\n id int [pk]\n}\n")
    );
  });

  test("rejects stateful migrations instead of producing incomplete DBML", async () => {
    const root = await mkdtemp(join(tmpdir(), "enops-dbml-"));
    await mkdir(join(root, "migrations"));
    await writeFile(
      join(root, "migrations", "001_create.sql"),
      "CREATE TABLE teams (id uuid PRIMARY KEY);"
    );
    await writeFile(
      join(root, "migrations", "002_add_name.sql"),
      "ALTER TABLE teams ADD COLUMN name text NOT NULL;"
    );
    await expect(extractRepositoryDbml(root)).rejects.toThrow(
      "Replay them in a disposable database"
    );
  });

  test("detects MySQL SQL", async () => {
    const root = await mkdtemp(join(tmpdir(), "enops-dbml-"));
    await writeFile(
      join(root, "schema.sql"),
      "CREATE TABLE `users` (`id` bigint AUTO_INCREMENT PRIMARY KEY);"
    );
    const result = await extractRepositoryDbml(root);
    expect(result?.format).toBe("mysql");
    expect(result?.dbml).toContain('Table "users"');
  });
});
