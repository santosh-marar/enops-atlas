import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The import route reads Prisma schemas with a wasm module that has to be
  // loaded from its own folder, and Drizzle schemas with the TypeScript
  // compiler. Neither can be bundled into the route.
  serverExternalPackages: ["@prisma/prisma-schema-wasm", "typescript"],
  transpilePackages: ["@enops/atlas-ui"],
};

export default nextConfig;
