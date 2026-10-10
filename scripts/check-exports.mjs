#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const snapshotPath = join(root, "scripts", "exports.snapshot.json");
const update = process.argv.includes("--update");

const entries = [
  ["@enops/atlas-schema", "packages/schema/dist/index.js"],
  ["@enops/atlas-graph", "packages/graph/dist/index.js"],
  ["@enops/atlas-generators", "packages/generators/dist/index.js"],
  [
    "@enops/atlas-schema-intelligence",
    "packages/schema-intelligence/dist/index.js",
  ],
  [
    "@enops/atlas-schema-intelligence/ai",
    "packages/schema-intelligence/dist/ai.js",
  ],
  [
    "@enops/atlas-schema-intelligence/node",
    "packages/schema-intelligence/dist/node.js",
  ],
  [
    "@enops/atlas-schema-intelligence/introspection",
    "packages/schema-intelligence/dist/introspection.js",
  ],
];

for (const [, file] of entries) {
  if (!existsSync(join(root, file))) {
    console.error(`Missing ${file}. Run the build first.`);
    process.exit(1);
  }
}

const current = Object.fromEntries(
  await Promise.all(
    entries.map(async ([name, file]) => {
      const module = await import(pathToFileURL(join(root, file)).href);
      return [name, Object.keys(module).sort()];
    })
  )
);

if (update) {
  writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Updated ${snapshotPath}`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(snapshotPath, "utf8"));
let failed = false;
for (const name of Object.keys(expected)) {
  const before = expected[name];
  const after = current[name] ?? [];
  const added = after.filter((key) => !before.includes(key));
  const removed = before.filter((key) => !after.includes(key));
  if (added.length || removed.length) {
    failed = true;
    console.error(`\n${name}`);
    for (const key of removed) console.error(`  - ${key}`);
    for (const key of added) console.error(`  + ${key}`);
  }
}

if (failed) {
  console.error(
    "\nPublic export surface changed. If intentional, run `pnpm api:snapshot` and commit the snapshot."
  );
  process.exit(1);
}
console.log("Public exports unchanged.");
