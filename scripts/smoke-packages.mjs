#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targets = [
  "packages/schema",
  "packages/graph",
  "packages/generators",
  "packages/schema-intelligence",
];

for (const target of targets) {
  if (!existsSync(join(root, target, "dist", "index.js"))) {
    console.error(`Missing build output for ${target}. Run the build first.`);
    process.exit(1);
  }
}

const work = mkdtempSync(join(tmpdir(), "enops-atlas-smoke-"));
try {
  const packs = join(work, "packs");
  const app = join(work, "app");
  mkdirSync(packs);
  mkdirSync(app);

  for (const target of targets) {
    execFileSync("pnpm", ["pack", "--pack-destination", packs], {
      cwd: join(root, target),
      stdio: "pipe",
    });
  }

  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ name: "atlas-smoke", private: true, type: "module" })
  );

  const tarballs = readdirSync(packs).map((file) => join(packs, file));
  execFileSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--loglevel=error", ...tarballs],
    { cwd: app, stdio: "pipe" }
  );

  copyFileSync(
    join(root, "scripts", "smoke", "consumer.mjs"),
    join(app, "consumer.mjs")
  );
  execFileSync(process.execPath, ["consumer.mjs"], {
    cwd: app,
    stdio: "inherit",
  });
} finally {
  rmSync(work, { force: true, recursive: true });
}
