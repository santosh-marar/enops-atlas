import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { extractRepositoryDbml } from "./repository-dbml";

export type SchemaSourceFile = {
  path: string;
  content: string;
  binary?: boolean;
};

/** Extract a saved file tree plus unsaved editor changes (deleted files drop out), without executing code. */
export async function extractForgeSchema(
  files: SchemaSourceFile[],
  overlay: Array<SchemaSourceFile & { deleted: boolean }>
) {
  const tree = new Map(files.filter((f) => !f.binary).map((f) => [f.path, f]));
  for (const file of overlay) {
    if (file.deleted) tree.delete(file.path);
    else tree.set(file.path, file);
  }
  const root = await mkdtemp(join(tmpdir(), "enops-schema-sync-"));
  try {
    let bytes = 0;
    let count = 0;
    for (const file of tree.values()) {
      if (!/\.(dbml|sql|prisma|[cm]?[tj]s)$/i.test(file.path)) continue;
      const path = normalize(file.path);
      if (path.startsWith("/") || path.startsWith("..") || path.includes("\\"))
        throw new Error("Invalid schema source path");
      if (
        /(^|\/)(\.git|\.next|\.turbo|build|dist|node_modules|target|vendor|fixtures|__fixtures__|__tests__|tests)(\/|$)/.test(
          path
        )
      )
        continue;
      bytes += Buffer.byteLength(file.content);
      count += 1;
      if (count > 2000 || bytes > 8_000_000)
        throw new Error("Schema source limit exceeded");
      // biome-ignore lint/performance/noAwaitInLoops: bound temporary filesystem writes.
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), file.content);
    }
    return await extractRepositoryDbml(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
