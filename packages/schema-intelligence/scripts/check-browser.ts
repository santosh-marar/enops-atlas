import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const forbidden = [
  /(?:from\s*|import\s*\(|require\s*\()\s*["']node:/,
  /(?:from\s*|import\s*\(|require\s*\()\s*["']@enops(?:\/|\.dev\/)(?!atlas-)/,
];
const outputRoot = await mkdtemp(join(tmpdir(), "enops-schema-browser-"));
try {
  const binary = new URL("../node_modules/.bin/esbuild", import.meta.url)
    .pathname;
  const sizes = await Promise.all(
    ["../src/index.ts", "../src/ai-entry.ts"].map(async (entry, index) => {
      const output = join(outputRoot, `entry-${index}.js`);
      const metafile = join(outputRoot, `entry-${index}.meta.json`);
      const process = Bun.spawn(
        [
          binary,
          new URL(entry, import.meta.url).pathname,
          "--bundle",
          "--format=esm",
          "--log-level=warning",
          `--metafile=${metafile}`,
          `--outfile=${output}`,
          "--platform=browser",
        ],
        { stderr: "pipe", stdout: "pipe" }
      );
      if ((await process.exited) !== 0)
        throw new Error(await new Response(process.stderr).text());
      const source = await readFile(output, "utf8");
      const match = forbidden.find((pattern) => pattern.test(source));
      if (match)
        throw new Error(
          `Browser bundle for ${entry} contains forbidden dependency ${match}`
        );
      const metadata = JSON.parse(await readFile(metafile, "utf8")) as {
        inputs: Record<string, unknown>;
      };
      const privateInput = Object.keys(metadata.inputs).find((path) =>
        /(?:^|\/)packages\/(?:ai|db|env|types)\//.test(path)
      );
      if (privateInput)
        throw new Error(
          `Browser bundle for ${entry} includes private workspace input ${privateInput}`
        );
      return (await stat(output)).size;
    })
  );
  const totalBytes = sizes.reduce((total, size) => total + size, 0);
  console.log(
    `Core and AI browser entries bundled successfully (${totalBytes} bytes total)`
  );
} finally {
  await rm(outputRoot, { force: true, recursive: true });
}
