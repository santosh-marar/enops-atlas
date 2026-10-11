import type ts from "typescript";
import {
  chain,
  type DrizzleEnum,
  fail,
  object,
  q,
  qual,
  type Source,
  str,
  type Table,
  typescript,
  unwrap,
} from "./ast";
import { buildColumn } from "./column";

/** Static, deliberately bounded PostgreSQL adapter. It never imports a user's
 * modules. Anything beyond the declarative subset fails with its file/line.
 */
export function drizzleToDbml(sources: Source[]): {
  dbml: string;
  warnings: string[];
  applicationBehavior: Record<string, string>;
} {
  const ts = typescript();
  const applicationBehavior: Record<string, string> = {};
  const printer = ts.createPrinter({ removeComments: true });
  const tables: Table[] = [];
  const enums = new Map<string, DrizzleEnum>();
  // `const sales = pgSchema("sales")` -> sales.table(...) / sales.enum(...)
  const schemas = new Map<string, string>();
  const files = sources.map(({ path, content }) =>
    ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )
  );
  for (const source of files) {
    const diagnostics = (
      source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
    ).parseDiagnostics;
    if (diagnostics.length)
      throw new Error(`${source.fileName}: invalid TypeScript schema syntax`);
    const imports = new Map<string, string>();
    for (const statement of source.statements) {
      if (
        !(
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier)
        )
      )
        continue;
      if (statement.moduleSpecifier.text !== "drizzle-orm/pg-core") continue;
      const bindings = statement.importClause?.namedBindings;
      if (!(bindings && ts.isNamedImports(bindings)))
        fail(
          statement,
          "Use named pg-core imports; namespace/dynamic schema imports are unsupported"
        );
      if (bindings && ts.isNamedImports(bindings))
        for (const specifier of bindings.elements)
          imports.set(
            specifier.name.text,
            specifier.propertyName?.text ?? specifier.name.text
          );
    }
    const accepted = new Set<ts.Node>();
    for (const statement of source.statements)
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations)
          if (declaration.initializer && ts.isIdentifier(declaration.name))
            accepted.add(unwrap(declaration.initializer));
      }
    for (const statement of source.statements)
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations) {
          if (!(declaration.initializer && ts.isIdentifier(declaration.name)))
            continue;
          const node = unwrap(declaration.initializer);
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            imports.get(node.expression.text) === "pgSchema"
          )
            schemas.set(declaration.name.text, str(node.arguments[0]));
        }
    const audit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const kind = imports.get(node.expression.text);
        if (
          kind &&
          [
            "pgTableCreator",
            "pgView",
            "pgMaterializedView",
            "pgSequence",
            "pgPolicy",
            "pgRole",
          ].includes(kind)
        )
          fail(node, `Unsupported Drizzle database object ${kind}`);
        if (
          kind &&
          ["pgTable", "pgEnum", "pgSchema"].includes(kind) &&
          !accepted.has(node)
        )
          fail(
            node,
            "Wrapped or dynamic schema declarations require sandbox introspection"
          );
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        schemas.has(node.expression.expression.text) &&
        ["table", "enum"].includes(node.expression.name.text) &&
        !accepted.has(node)
      )
        fail(
          node,
          "Wrapped or dynamic schema declarations require sandbox introspection"
        );
      ts.forEachChild(node, audit);
    };
    audit(source);
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!(declaration.initializer && ts.isIdentifier(declaration.name)))
          continue;
        const node = unwrap(declaration.initializer);
        if (!ts.isCallExpression(node)) continue;
        let kind: string | undefined;
        let schemaName = "public";
        if (ts.isIdentifier(node.expression)) {
          kind = imports.get(node.expression.text);
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          schemas.has(node.expression.expression.text) &&
          ["table", "enum"].includes(node.expression.name.text)
        ) {
          kind = node.expression.name.text === "table" ? "pgTable" : "pgEnum";
          schemaName = schemas.get(node.expression.expression.text) ?? "public";
        } else {
          continue;
        }
        if (kind === "pgEnum") {
          const [, values] = node.arguments;
          if (!(values && ts.isArrayLiteralExpression(values)))
            fail(node, "Dynamic pgEnum values require sandbox evaluation");
          if (enums.has(declaration.name.text))
            fail(node, "Ambiguous enum variable across schema files");
          enums.set(declaration.name.text, {
            name: str(node.arguments[0]),
            schema: schemaName,
            values: (values as ts.ArrayLiteralExpression).elements.map(str),
          });
        }
        if (kind === "pgTable") {
          const fields = object(node.arguments[1]);
          if (
            tables.some((t) => t.variable === declaration.name.getText(source))
          )
            fail(node, "Ambiguous table variable across schema files");
          const table: Table = {
            columns: new Map(),
            imports,
            lines: [],
            name: str(node.arguments[0]),
            node,
            refs: [],
            schema: schemaName,
            source,
            variable: declaration.name.text,
          };
          for (const [property, expression] of fields)
            buildColumn({
              applicationBehavior,
              enums,
              expression,
              imports,
              printer,
              property,
              source,
              table,
            });
          tables.push(table);
        } else if (kind && !["pgEnum", "pgSchema"].includes(kind))
          fail(node, `Unsupported top-level Drizzle schema builder ${kind}`);
      }
    }
  }
  const blocks = [...enums.values()].map(
    (e) =>
      `Enum ${qual(e.schema, e.name)} {\n${e.values.map((v) => `  ${q(v)}`).join("\n")}\n}`
  );
  const refs: string[] = [];
  for (const table of tables) {
    const [, , extra] = table.node.arguments;
    if (extra) table.lines.push(tableIndexes(table, extra));
    blocks.push(
      `Table ${qual(table.schema, table.name)} {\n${table.lines.join("\n")}\n}`
    );
    for (const ref of table.refs) {
      const target = tables.find((t) => t.variable === ref.target);
      const column = target?.columns.get(ref.property);
      if (!(target && column))
        throw new Error(
          `Unresolved foreign key ${table.variable}.${ref.column}; include all schema files without import aliases.`
        );
      refs.push(
        `Ref: ${qual(table.schema, table.name)}.${q(ref.column)} > ${qual(target.schema, target.name)}.${q(column)}${ref.actions ? ` [${ref.actions}]` : ""}`
      );
    }
  }
  if (!tables.length)
    throw new Error("No supported PostgreSQL Drizzle table declarations found");
  return {
    applicationBehavior,
    dbml: [
      'Project schema_model {\n database_type: "PostgreSQL"\n}',
      ...blocks,
      ...refs,
    ].join("\n\n"),
    warnings: [],
  };
}

function tableIndexes(table: Table, extra: ts.Expression): string {
  const ts = typescript();
  if (!ts.isArrowFunction(extra))
    fail(extra, "Table constraints must use an arrow function");
  const fn = extra as ts.ArrowFunction;
  if (!ts.isExpression(fn.body))
    fail(fn, "Constraint callback blocks require sandbox evaluation");
  const body = unwrap(fn.body as ts.Expression);
  const items = ts.isArrayLiteralExpression(body)
    ? [...body.elements]
    : [...object(body).values()];
  const indexes: string[] = [];
  for (const item of items) {
    const calls = chain(item);
    const base = calls[0]!;
    const kind = table.imports.get(base.name);
    if (
      !(kind && ["index", "uniqueIndex", "unique"].includes(kind)) ||
      calls.length !== 2 ||
      calls[1]?.name !== "on"
    )
      fail(
        item,
        "Composite keys, checks, expressions and advanced indexes require sandbox metadata extraction"
      );
    const fields = calls[1]!.args.map((arg) => {
      if (
        !ts.isPropertyAccessExpression(arg) ||
        arg.expression.getText(table.source) !==
          fn.parameters[0]?.name.getText(table.source)
      )
        return fail(arg, "Expression index requires sandbox evaluation");
      const name = table.columns.get(arg.name.text);
      if (!name) return fail(arg, "Unknown indexed column");
      return q(name);
    });
    const attrs = kind === "index" ? [] : ["unique"];
    if (base.args[0]) attrs.push(`name: ${q(str(base.args[0]))}`);
    indexes.push(
      `    (${fields.join(", ")})${attrs.length ? ` [${attrs.join(", ")}]` : ""}`
    );
  }
  return `  indexes {\n${indexes.join("\n")}\n  }`;
}
