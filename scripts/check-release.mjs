#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const folder = fileURLToPath(new URL("../.changeset/", import.meta.url));
// In pre-release mode (`changeset pre enter beta`) changesets keep their files
// after `changeset version`; pre.json lists the ones already applied.
const prePath = `${folder}pre.json`;
const applied = new Set(
  existsSync(prePath)
    ? (JSON.parse(readFileSync(prePath, "utf8")).changesets ?? [])
    : []
);
const pending = readdirSync(folder).filter(
  (name) =>
    name.endsWith(".md") &&
    name !== "README.md" &&
    !applied.has(name.slice(0, -3))
);
if (pending.length) {
  console.error(
    `Release versions have not been applied (${pending.length} pending changeset). Run pnpm version-packages and review the versions and changelogs before publishing.`
  );
  process.exit(1);
}
console.log("Release version preparation is complete.");
