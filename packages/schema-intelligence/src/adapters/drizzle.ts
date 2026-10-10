import { createRequire } from "node:module";
import type ts from "typescript";

const requireModule = createRequire(import.meta.url);

/**
 * TypeScript is only needed to read Drizzle schemas, so it is loaded when
 * `drizzleToDbml` runs, not when this package is imported. Prisma import and
 * everything else work without it.
 */
function loadTypescript(): typeof ts {
  try {
    return requireModule("typescript") as typeof ts;
  } catch {
    throw new Error(
      'Reading Drizzle schemas needs the "typescript" package. Install it with: npm install typescript'
    );
  }
}

const q = JSON.stringify;
/** DBML name for a table or enum: "schema"."name", or just "name" in public. */
const qual = (schema: string, name: string) =>
  schema === "public" ? q(name) : `${q(schema)}.${q(name)}`;
type Source = { path: string; content: string };
type Call = { name: string; args: readonly ts.Expression[] };
type Table = {
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

/** Static, deliberately bounded PostgreSQL adapter. It never imports a user's
 * modules. Anything beyond the declarative subset fails with its file/line.
 */
export function drizzleToDbml(sources: Source[]): {
  dbml: string;
  warnings: string[];
} {
  const ts = loadTypescript();
  const tables: Table[] = [];
  const enums = new Map<
    string,
    { name: string; schema: string; values: string[] }
  >();
  // `const sales = pgSchema("sales")` -> sales.table(...) / sales.enum(...)
  const schemas = new Map<string, string>();
  const fail = (node: ts.Node, message: string): never => {
    const file = node.getSourceFile();
    throw new Error(
      `${file.fileName}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${message}`
    );
  };
  const str = (node: ts.Expression | undefined): string => {
    if (
      node &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    )
      return node.text;
    throw new Error("Drizzle schema names must be string literals");
  };
  const unwrap = (node: ts.Expression): ts.Expression => {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current)
    )
      current = current.expression;
    return current;
  };
  const object = (
    node: ts.Expression | undefined
  ): Map<string, ts.Expression> => {
    if (!node) return new Map();
    const expression = unwrap(node);
    if (!ts.isObjectLiteralExpression(expression))
      return fail(
        expression,
        "Dynamic Drizzle configuration needs sandbox evaluation"
      );
    return new Map(
      expression.properties.map((p) => {
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
  const chain = (node: ts.Expression): Call[] => {
    const expression = unwrap(node);
    if (!ts.isCallExpression(expression))
      return fail(
        expression,
        "Column must be a declarative Drizzle builder call"
      );
    if (ts.isIdentifier(expression.expression))
      return [{ args: expression.arguments, name: expression.expression.text }];
    if (ts.isPropertyAccessExpression(expression.expression))
      return [
        ...chain(expression.expression.expression),
        {
          args: expression.arguments,
          name: expression.expression.name.text,
        },
      ];
    return fail(expression, "Unsupported Drizzle builder expression");
  };
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
          const values = node.arguments[1];
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
          for (const [property, expression] of fields) {
            const calls = chain(expression);
            const base = calls[0]!;
            const builder =
              imports.get(base.name) ??
              (enums.has(base.name) ? "enum" : undefined);
            const types: Record<string, string> = {
              bigint: "bigint",
              bigserial: "bigserial",
              boolean: "boolean",
              char: "char",
              date: "date",
              decimal: "decimal",
              doublePrecision: "double precision",
              integer: "integer",
              json: "json",
              jsonb: "jsonb",
              numeric: "numeric",
              real: "real",
              serial: "serial",
              smallint: "smallint",
              smallserial: "smallserial",
              text: "text",
              timestamp: "timestamp",
              uuid: "uuid",
              varchar: "varchar",
            };
            let type =
              builder === "enum"
                ? qual(enums.get(base.name)!.schema, enums.get(base.name)!.name)
                : types[builder ?? ""];
            if (!type)
              throw new Error(
                `Unsupported Drizzle column builder ${base.name}`
              );
            const first = base.args[0];
            const explicitName = first && ts.isStringLiteral(first);
            const name = explicitName ? first.text : property;
            const config = object(base.args[explicitName ? 1 : 0]);
            const numeric = (key: string) => {
              const value = config.get(key);
              if (!value) return;
              if (!ts.isNumericLiteral(value))
                return fail(value, `Nonliteral ${key}`);
              return value.text;
            };
            const allowedConfig = new Set([
              "mode",
              "length",
              "precision",
              "scale",
              "withTimezone",
            ]);
            for (const key of config.keys())
              if (!allowedConfig.has(key))
                fail(expression, `Unsupported column option ${key}`);
            if (["varchar", "char"].includes(builder!)) {
              const length = numeric("length");
              if (length) type += `(${length})`;
            }
            if (["numeric", "decimal"].includes(builder!)) {
              const precision = numeric("precision"),
                scale = numeric("scale");
              if (precision)
                type += `(${precision}${scale ? `,${scale}` : ""})`;
            }
            if (builder === "timestamp") {
              const tz = config.get("withTimezone");
              if (
                tz &&
                ![
                  ts.SyntaxKind.TrueKeyword,
                  ts.SyntaxKind.FalseKeyword,
                ].includes(tz.kind)
              )
                fail(tz, "Dynamic timezone option");
              if (tz?.kind === ts.SyntaxKind.TrueKeyword) type = "timestamptz";
              const precision = numeric("precision");
              if (precision) type += `(${precision})`;
            }
            const settings: string[] = [];
            if (["serial", "bigserial", "smallserial"].includes(builder!))
              settings.push("increment", "not null");
            for (const call of calls.slice(1)) {
              if (call.name === "notNull") settings.push("not null");
              else if (call.name === "primaryKey")
                settings.push("pk", "not null");
              else if (call.name === "unique" && !call.args.length)
                settings.push("unique");
              else if (call.name === "array" && !call.args.length) type += "[]";
              else if (call.name === "defaultNow")
                settings.push("default: `now()`");
              else if (call.name === "defaultRandom")
                settings.push("default: `gen_random_uuid()`");
              else if (call.name === "default") {
                const value = call.args[0];
                if (
                  value &&
                  (ts.isStringLiteral(value) ||
                    ts.isNumericLiteral(value) ||
                    [
                      ts.SyntaxKind.TrueKeyword,
                      ts.SyntaxKind.FalseKeyword,
                    ].includes(value.kind))
                )
                  settings.push(
                    `default: ${ts.isStringLiteral(value) ? q(value.text) : value.getText(source)}`
                  );
                else
                  fail(
                    expression,
                    "SQL/expression defaults require sandbox metadata extraction"
                  );
              } else if (call.name === "references") {
                const fn = call.args[0];
                if (
                  !(
                    fn &&
                    ts.isArrowFunction(fn) &&
                    ts.isPropertyAccessExpression(fn.body) &&
                    ts.isIdentifier(fn.body.expression)
                  )
                )
                  fail(expression, "Dynamic foreign key target");
                const ref = (fn as ts.ArrowFunction)
                  .body as ts.PropertyAccessExpression;
                const options = object(call.args[1]);
                const actions: string[] = [];
                for (const [key, value] of options) {
                  if (!["onDelete", "onUpdate"].includes(key))
                    fail(value, "Unknown reference option");
                  const act = str(value);
                  if (
                    ![
                      "cascade",
                      "restrict",
                      "no action",
                      "set null",
                      "set default",
                    ].includes(act)
                  )
                    fail(value, "Unsupported referential action");
                  actions.push(
                    `${key === "onDelete" ? "delete" : "update"}: ${act}`
                  );
                }
                table.refs.push({
                  actions: actions.join(", "),
                  column: name,
                  property: ref.name.text,
                  target: ref.expression.getText(source),
                });
              } else if (call.name !== "$type")
                fail(
                  expression,
                  `Unsupported column method ${call.name}; original source must be retained`
                );
            }
            table.columns.set(property, name);
            table.lines.push(
              `  ${q(name)} ${type.includes(" ") || type.endsWith("[]") ? q(type) : type}${settings.length ? ` [${[...new Set(settings)].join(", ")}]` : ""}`
            );
          }
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
    const extra = table.node.arguments[2];
    if (extra) {
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
      table.lines.push(`  indexes {\n${indexes.join("\n")}\n  }`);
    }
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
    dbml: [
      'Project schema_model {\n database_type: "PostgreSQL"\n}',
      ...blocks,
      ...refs,
    ].join("\n\n"),
    warnings: [],
  };
}
