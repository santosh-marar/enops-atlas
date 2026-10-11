import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import { extractRepositoryDbml } from "./repository-dbml";
import { schemaChanges, schemaSynchronizationLosses } from "./schema-snapshot";

/** Read-only view of a (remote) workspace, e.g. a sandbox. */
export interface SchemaTargetWorkspace {
  listFiles: (dir?: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
}

export interface SchemaTargetCheck {
  /** Differences from the patched repository to the approved Atlas target. */
  changes: ReturnType<typeof schemaChanges>["changes"];
  format: string | null;
  passed: boolean;
  reason:
    | "matches_target"
    | "schema_mismatch"
    | "unsupported_or_lossy"
    | "no_schema"
    | "extraction_failed";
  repositoryDigest: string | null;
  sourcePaths: string[];
  warnings: string[];
}

// Mirrors repository discovery: only files it could read are copied.
const CANDIDATE = /\.(dbml|sql|prisma|[cm]?ts|[cm]?js)$/i;
const IGNORED =
  /(^|\/)(\.git|\.next|\.turbo|build|dist|node_modules|target|vendor|fixtures|__fixtures__|__tests__|tests)\//;

/**
 * Re-extracts the physical schema from a patched workspace and requires it to
 * equal the approved Atlas schema exactly. The workspace is copied into a
 * private temporary directory; no repository code is executed.
 */
export async function checkRepositorySchemaTarget(
  workspace: SchemaTargetWorkspace,
  target: {
    dbml: string;
    digest: string;
    applicationBehavior?: Record<string, string>;
  }
): Promise<SchemaTargetCheck> {
  const root = await mkdtemp(join(tmpdir(), "enops-schema-target-"));
  try {
    const paths = (await workspace.listFiles()).filter(
      (path) =>
        CANDIDATE.test(path) &&
        !IGNORED.test(`/${path}`) &&
        !/\.(test|spec|d)\./.test(path)
    );
    if (paths.length > 2000)
      return failed("extraction_failed", [
        "Too many files; choose an application root for schema sync",
      ]);
    for (const path of paths) {
      const safe = normalize(path);
      if (safe.startsWith("..") || safe.startsWith("/")) continue;
      // biome-ignore lint/performance/noAwaitInLoops: sequential reads keep remote workspace load bounded.
      const content = await workspace.readFile(path);
      await mkdir(dirname(join(root, safe)), { recursive: true });
      await writeFile(join(root, safe), content);
    }

    let extracted: Awaited<ReturnType<typeof extractRepositoryDbml>>;
    try {
      extracted = await extractRepositoryDbml(root);
    } catch (error) {
      return failed("extraction_failed", [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    if (!extracted) return failed("no_schema", []);
    const warnings = [
      ...(extracted.warnings ?? []),
      ...(extracted.snapshot
        ? schemaSynchronizationLosses(extracted.snapshot).map(
            (loss) => loss.message
          )
        : []),
    ];
    for (const [key, expected] of Object.entries(
      target.applicationBehavior ?? {}
    )) {
      if (extracted.applicationBehavior?.[key] !== expected)
        warnings.push(
          `Preserve existing Drizzle source mapping and runtime behavior for ${key}. Review removals manually.`
        );
    }
    const base = {
      format: extracted.format,
      repositoryDigest: extracted.digest,
      sourcePaths: extracted.sourcePaths,
      warnings,
    };
    if (warnings.length)
      return {
        ...base,
        changes: [],
        passed: false,
        reason: "unsupported_or_lossy",
      };
    if (extracted.digest === target.digest)
      return { ...base, changes: [], passed: true, reason: "matches_target" };
    return {
      ...base,
      changes: schemaChanges(extracted.dbml, target.dbml).changes,
      passed: false,
      reason: "schema_mismatch",
    };
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

function failed(
  reason: SchemaTargetCheck["reason"],
  warnings: string[]
): SchemaTargetCheck {
  return {
    changes: [],
    format: null,
    passed: false,
    reason,
    repositoryDigest: null,
    sourcePaths: [],
    warnings,
  };
}

/** Human/agent-readable feedback for a failed check (used for repair). */
export function describeSchemaTargetCheck(check: SchemaTargetCheck): string {
  if (check.passed)
    return `Repository schema (${check.format}) matches the approved Atlas target.`;
  switch (check.reason) {
    case "schema_mismatch":
      return [
        `Repository schema (${check.format}) does not match the approved Atlas target. Remaining differences:`,
        ...check.changes.map((c) => `- ${c.change}: ${c.object}`),
      ].join("\n");
    case "unsupported_or_lossy":
      return [
        "Repository schema uses constructs Enops cannot verify exactly:",
        ...check.warnings.map((w) => `- ${w}`),
      ].join("\n");
    case "no_schema":
      return "No supported schema definition was found in the repository.";
    default:
      return `Schema extraction failed: ${check.warnings.join("; ")}`;
  }
}
