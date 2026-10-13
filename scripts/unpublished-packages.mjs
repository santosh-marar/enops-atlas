// Lists the workspace packages whose current version is not on npm yet, and
// tells GitHub Actions whether there are any (`any=true|false`). Used by the
// release workflow so a push with no version change finishes in seconds.
import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";

const unpublished = [];
for (const dir of readdirSync("packages")) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(`packages/${dir}/package.json`, "utf8"));
  } catch {
    continue;
  }
  if (pkg.private) continue;
  const spec = `${pkg.name}@${pkg.version}`;
  try {
    execFileSync("npm", ["view", spec, "version"], { stdio: "pipe" });
  } catch (error) {
    const text = `${error.stderr ?? ""}${error.stdout ?? ""}`;
    // Only a missing version counts. Any other failure (network, registry)
    // must not look like "nothing to publish" or like "everything is new".
    if (!/E404|404 Not Found|No match found/i.test(text)) {
      console.error(`Could not check ${spec}: ${text.trim().slice(0, 200)}`);
      process.exit(1);
    }
    unpublished.push(spec);
  }
}

console.log(
  unpublished.length > 0
    ? `Not on npm yet:\n${unpublished.map((s) => `  ${s}`).join("\n")}`
    : "Every package version is already on npm."
);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `any=${unpublished.length > 0}\n`);
}
