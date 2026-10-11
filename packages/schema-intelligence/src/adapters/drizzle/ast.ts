import { createRequire } from "node:module";
import type ts from "typescript";

const requireModule = createRequire(import.meta.url);
let loaded: typeof ts | undefined;

/**
 * TypeScript is only needed to read Drizzle schemas, so it is loaded when
 * `drizzleToDbml` runs, not when this package is imported. Prisma import and
 * everything else work without it.
 */
export function typescript(): typeof ts {
  if (loaded) return loaded;
  try {
    loaded = requireModule("typescript") as typeof ts;
    return loaded;
  } catch {
    throw new Error(
      'Reading Drizzle schemas needs the "typescript" package. Install it with: npm install typescript'
    );
  }
}

export const q = JSON.stringify;
/** DBML name for a table or enum: "schema"."name", or just "name" in public. */
export const qual = (schema: string, name: string) =>
  schema === "public" ? q(name) : `${q(schema)}.${q(name)}`;

// Drizzle hooks that only run in application code and never change the
// database schema, so they are safe to ignore when deriving DDL.
export const RUNTIME_ONLY_COLUMN_METHODS = new Set([
  "$type",
  "$onUpdate",
  "$onUpdateFn",
  "$default",
  "$defaultFn",
]);
export type Source = { path: string; content: string };
export type Call = {
  name: string;
  args: readonly ts.Expression[];
  typeArgs?: readonly ts.TypeNode[];
};
export type DrizzleEnum = { name: string; schema: string; values: string[] };
export type Table = {
  variable: string;
  name: string;
  schema: string;
  columns: Map<string, string>;
  lines: string[];
  refs: { column: string; target: string; property: string; actions: string }[];
  node: ts.CallExpression;
  imports: Map<string, string>;
  source: ts.SourceFile;
};

export const fail = (node: ts.Node, message: string): never => {
  const file = node.getSourceFile();
  throw new Error(
    `${file.fileName}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${message}`
  );
};
export const str = (node: ts.Expression | undefined): string => {
  const ts = typescript();
  if (
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  )
    return node.text;
  throw new Error("Drizzle schema names must be string literals");
};
export const unwrap = (node: ts.Expression): ts.Expression => {
  const ts = typescript();
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  )
    current = current.expression;
  return current;
};
export const object = (
  node: ts.Expression | undefined
): Map<string, ts.Expression> => {
  const ts = typescript();
  if (!node) return new Map();
  const unwrapped = unwrap(node);
  if (!ts.isObjectLiteralExpression(unwrapped))
    return fail(
      unwrapped,
      "Dynamic Drizzle configuration needs sandbox evaluation"
    );
  return new Map(
    unwrapped.properties.map((p) => {
      if (
        !(
          ts.isPropertyAssignment(p) &&
          (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
        )
      )
        return fail(
          p,
          "Spreads/computed schema properties require sandbox evaluation"
        );
      return [p.name.text, p.initializer];
    })
  );
};
export const chain = (node: ts.Expression): Call[] => {
  const ts = typescript();
  const unwrapped = unwrap(node);
  if (!ts.isCallExpression(unwrapped))
    return fail(unwrapped, "Column must be a declarative Drizzle builder call");
  if (ts.isIdentifier(unwrapped.expression))
    return [{ args: unwrapped.arguments, name: unwrapped.expression.text }];
  if (ts.isPropertyAccessExpression(unwrapped.expression))
    return [
      ...chain(unwrapped.expression.expression),
      {
        args: unwrapped.arguments,
        name: unwrapped.expression.name.text,
        typeArgs: unwrapped.typeArguments,
      },
    ];
  return fail(unwrapped, "Unsupported Drizzle builder expression");
};
