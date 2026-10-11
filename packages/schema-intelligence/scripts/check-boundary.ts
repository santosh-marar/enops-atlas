import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const sourceRoot = join(import.meta.dir, "..", "src");
const forbiddenImport =
  /(?:from\s*|import\s*\(\s*)["']@enops(?:\.dev)?\/(?!atlas-)/;
const nodeImport = /(?:from\s*|import\s*\(\s*)["']node:/;
const files: string[] = [];

async function visit(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(path);
    })
  );
}

await visit(sourceRoot);
const violations: string[] = [];
const sources = await Promise.all(
  files.map(async (file) => [file, await readFile(file, "utf8")] as const)
);
for (const [file, source] of sources) {
  if (forbiddenImport.test(source)) {
    violations.push(`${file}: private Enops import`);
  }
  const relative = file.slice(sourceRoot.length + 1).replaceAll("\\", "/");
  if (
    !(
      relative.startsWith("tests/") ||
      relative.includes("/tests/") ||
      relative.includes("/__tests__/") ||
      relative.startsWith("node-entry") ||
      relative.startsWith("adapters/") ||
      relative.startsWith("repository-dbml") ||
      relative.startsWith("schema-target")
    ) &&
    nodeImport.test(source)
  ) {
    violations.push(`${file}: Node builtin import outside node entry`);
  }
}

if (violations.length > 0) {
  throw new Error(
    `Schema Intelligence runtime boundary violations:\n${violations.join("\n")}`
  );
}
console.log(
  `Schema Intelligence boundary passed (${files.length} source files)`
);
