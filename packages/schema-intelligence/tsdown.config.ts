import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    ai: "src/ai-entry.ts",
    index: "src/index.ts",
    introspection: "src/introspection/index.ts",
    node: "src/node-entry.ts",
  },
  format: ["esm"],
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  platform: "node",
  sourcemap: true,
  target: "es2022",
});
