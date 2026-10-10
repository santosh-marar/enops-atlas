import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { importer } from "@dbml/core";
import { drizzleToDbml } from "./adapters/drizzle";
import { normalizeDirectDbml } from "./direct-dbml";
import { schemaSnapshot } from "./schema-snapshot";

type SqlDialect = "postgres" | "mysql";

export interface RepositoryDbmlResult {
  dbml: string;
  digest: string;
  format: "dbml" | "prisma" | "drizzle" | SqlDialect;
  snapshot?: ReturnType<typeof schemaSnapshot>;
  sourcePaths: string[];
  warnings?: string[];
}

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "fixtures",
  "__fixtures__",
  "__tests__",
  "tests",
]);

async function discover(
  root: string,
  current: string,
  output: string[],
  depth = 0,
  budget = { directories: 0 }
) {
  if (depth > 40)
    throw new Error("Schema discovery exceeded directory depth limit");
  if (++budget.directories > 10_000)
    throw new Error("Schema discovery exceeded directory count limit");
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        // biome-ignore lint/performance/noAwaitInLoops: Bound directory work and file descriptors during discovery.
        await discover(root, absolute, output, depth + 1, budget);
      }
    } else if (
      entry.isFile() &&
      /\.(dbml|sql|prisma|[cm]?ts|[cm]?js)$/i.test(entry.name) &&
      !/\.(test|spec|d)\./.test(entry.name)
    ) {
      output.push(relative(root, absolute));
      if (output.length > 2000)
        throw new Error(
          "Too many files; choose an application root for schema sync"
        );
    }
  }
}

/**
 * Produces a loss-aware physical schema snapshot from declarative sources.
 * Competing definitions and stateful migrations fail closed; no source code
 * or migrations are executed on the ingestion worker.
 */
export async function extractRepositoryDbml(
  root: string
): Promise<RepositoryDbmlResult | null> {
  const paths: string[] = [];
  await discover(root, root, paths);
  paths.sort();
  let total = 0;
  const read = async (path: string) => {
    const handle = await import("node:fs/promises").then((fs) =>
      fs.open(join(root, path), "r")
    );
    try {
      const size = (await handle.stat()).size;
      total += size;
      if (size > 2_000_000 || total > 8_000_000)
        throw new Error(
          "Schema inputs exceed size limit; choose an application root"
        );
      return { content: await handle.readFile("utf8"), path };
    } finally {
      await handle.close();
    }
  };
  const finish = (
    dbml: string,
    format: RepositoryDbmlResult["format"],
    files: { path: string; content: string }[],
    warnings: string[] = []
  ) => {
    const normalizedDbml = normalizeDirectDbml(dbml);
    const snapshot = schemaSnapshot(normalizedDbml);
    if (!snapshot.physical.tables.length)
      throw new Error("No tables detected; refusing an empty schema candidate");
    return {
      dbml: normalizedDbml,
      digest: snapshot.digest,
      format,
      snapshot,
      sourcePaths: files.map((f) => f.path),
      sources: files.map((f) => ({
        path: f.path,
        sha256: createHash("sha256").update(f.content).digest("hex"),
      })),
      warnings,
    };
  };
  const dbmlPaths = paths.filter((p) => p.endsWith(".dbml"));
  const prismaPaths = paths.filter((p) => p.endsWith(".prisma"));
  const snapshots = paths.filter(
    (p) =>
      /(^|\/)(schema|structure|dump)\.sql$/i.test(p) &&
      !/(^|\/)migrations?\//.test(p)
  );
  if (dbmlPaths.length > 1 || snapshots.length > 1)
    throw new Error(
      "Multiple database definitions; select an application/database root for Atlas sync"
    );
  if (dbmlPaths.length && prismaPaths.length)
    throw new Error(
      "Both DBML and Prisma found; select the authoritative database root"
    );
  const drizzleFiles: { path: string; content: string }[] = [];
  const drizzleCandidates = [];
  for (const path of paths.filter((p) => /\.[cm]?[tj]s$/.test(p))) {
    // biome-ignore lint/performance/noAwaitInLoops: Enforce the shared byte limit before opening the next input.
    drizzleCandidates.push(await read(path));
  }
  for (const file of drizzleCandidates) {
    if (
      /from\s*["']drizzle-orm\/(pg|mysql|sqlite)-core["']/.test(file.content)
    ) {
      if (/drizzle-orm\/(mysql|sqlite)-core/.test(file.content))
        throw new Error(
          "Only PostgreSQL Drizzle declarations are currently supported"
        );
      drizzleFiles.push(file);
    }
  }
  if (prismaPaths.length) {
    if (drizzleFiles.length)
      throw new Error(
        "Both Prisma and Drizzle found; select one authoritative database root"
      );
    const files = [];
    for (const path of prismaPaths) {
      // biome-ignore lint/performance/noAwaitInLoops: Enforce the shared byte limit before opening the next input.
      files.push(await read(path));
    }
    const { prismaToDbml } = await import("./adapters/prisma");
    const converted = prismaToDbml(files.map((f) => [f.path, f.content]));
    return finish(converted.dbml, "prisma", files, converted.warnings);
  }
  if (drizzleFiles.length) {
    if (dbmlPaths.length)
      throw new Error(
        "Both DBML and Drizzle found; select the authoritative database root"
      );
    const converted = drizzleToDbml(drizzleFiles);
    return finish(converted.dbml, "drizzle", drizzleFiles, converted.warnings);
  }
  if (dbmlPaths.length) {
    const file = await read(dbmlPaths[0]!);
    return finish(file.content, "dbml", [file]);
  }
  if (!snapshots.length) {
    if (paths.some((p) => p.endsWith(".sql")))
      throw new Error(
        "Historical SQL requires replay. Replay them in a disposable database and provide schema.sql, structure.sql or dump.sql."
      );
    return null;
  }
  const file = await read(snapshots[0]!);
  // Even a file called schema.sql can contain history the parser ignores.
  if (
    /\b(ALTER|DROP|RENAME|TRUNCATE|INSERT|UPDATE|DELETE|DO|EXECUTE|FUNCTION|TRIGGER|PROCEDURE|POLICY|VIEW|SEQUENCE|EXTENSION|GRANT|REVOKE|PARTITION)\b/i.test(
      file.content
    )
  )
    throw new Error(
      "SQL contains operations beyond supported CREATE schema DDL; database introspection is required"
    );
  if (
    /\b(DOMAIN|COLLATE|GENERATED|DEFERRABLE|EXCLUDE|INHERITS|WHERE|INCLUDE|UNLOGGED|TABLESPACE|PUBLICATION|SUBSCRIPTION)\b/i.test(
      file.content
    )
  )
    throw new Error(
      "Advanced SQL schema features require database introspection"
    );
  const dialect = /AUTO_INCREMENT|`/.test(file.content) ? "mysql" : "postgres";
  // @dbml/core's SQL importer also passes numeric defaults through JS Number.
  // Until a token-preserving SQL adapter exists, reject values it would alter.
  for (const match of file.content.matchAll(
    /\bDEFAULT\s*\(?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gi
  )) {
    const literal = match[1]!;
    if (
      !Number.isFinite(Number(literal)) ||
      (Number.isInteger(Number(literal)) &&
        !Number.isSafeInteger(Number(literal))) ||
      String(Number(literal)) !== literal
    )
      throw new Error(
        "SQL numeric default cannot be imported without precision loss; exact database introspection is required"
      );
  }
  const converted = importer.import(file.content, dialect);
  return finish(
    `Project schema_model {\n database_type: "${dialect === "mysql" ? "MySQL" : "PostgreSQL"}"\n}\n${converted}`,
    dialect,
    [file]
  );
}
