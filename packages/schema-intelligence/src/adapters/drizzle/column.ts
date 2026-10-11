import type ts from "typescript";
import {
  chain,
  type DrizzleEnum,
  fail,
  object,
  q,
  qual,
  RUNTIME_ONLY_COLUMN_METHODS,
  str,
  type Table,
  typescript,
} from "./ast";

export function buildColumn({
  applicationBehavior,
  enums,
  expression,
  imports,
  printer,
  property,
  source,
  table,
}: {
  applicationBehavior: Record<string, string>;
  enums: Map<string, DrizzleEnum>;
  expression: ts.Expression;
  imports: Map<string, string>;
  printer: ts.Printer;
  property: string;
  source: ts.SourceFile;
  table: Table;
}): void {
  const ts = typescript();
  const calls = chain(expression);
  const base = calls[0]!;
  const builder =
    imports.get(base.name) ?? (enums.has(base.name) ? "enum" : undefined);
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
  if (!type) throw new Error(`Unsupported Drizzle column builder ${base.name}`);
  const [first] = base.args;
  const explicitName = first && ts.isStringLiteral(first);
  const name = explicitName ? first.text : property;
  const config = object(base.args[explicitName ? 1 : 0]);
  // DBML cannot represent JS property/export names or runtime hooks.
  // Pin them separately so physical-schema verification cannot hide loss.
  const print = (node: ts.Node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, source);
  applicationBehavior[JSON.stringify([source.fileName, table.name, name])] =
    JSON.stringify({
      mode: config.get("mode") ? print(config.get("mode")!) : null,
      property,
      runtime: calls
        .filter((call) => RUNTIME_ONLY_COLUMN_METHODS.has(call.name))
        .map((call) => ({
          args: call.args.map(print),
          name: call.name,
          types: call.typeArgs?.map(print) ?? [],
        })),
      variable: table.variable,
    });

  const numeric = (key: string) => {
    const value = config.get(key);
    if (!value) return;
    if (!ts.isNumericLiteral(value)) return fail(value, `Nonliteral ${key}`);
    return value.text;
  };
  const allowedConfig = new Set([
    // TypeScript-only value union; the column stays text/varchar.
    "enum",
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
    if (precision) type += `(${precision}${scale ? `,${scale}` : ""})`;
  }
  if (builder === "timestamp") {
    const tz = config.get("withTimezone");
    if (
      tz &&
      ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(tz.kind)
    )
      fail(tz, "Dynamic timezone option");
    if (tz?.kind === ts.SyntaxKind.TrueKeyword) type = "timestamptz";
    const precision = numeric("precision");
    if (precision) type += `(${precision})`;
  }
  const settings: string[] = [];
  const enumValues = config.get("enum");
  if (enumValues && ts.isArrayLiteralExpression(enumValues)) {
    const values = enumValues.elements
      .filter(ts.isStringLiteral)
      .map((element) => element.text);
    if (values.length > 0) {
      settings.push(`note: ${q(`one of: ${values.join(", ")}`)}`);
    }
  }
  if (["serial", "bigserial", "smallserial"].includes(builder!))
    settings.push("increment", "not null");
  for (const call of calls.slice(1)) {
    if (call.name === "notNull") settings.push("not null");
    else if (call.name === "primaryKey") settings.push("pk", "not null");
    else if (call.name === "unique" && !call.args.length)
      settings.push("unique");
    else if (call.name === "array" && !call.args.length) type += "[]";
    else if (call.name === "defaultNow") settings.push("default: `now()`");
    else if (call.name === "defaultRandom")
      settings.push("default: `gen_random_uuid()`");
    else if (call.name === "default") {
      const [value] = call.args;
      if (
        value &&
        ts.isTaggedTemplateExpression(value) &&
        value.tag.getText(source) === "sql" &&
        ts.isNoSubstitutionTemplateLiteral(value.template)
      ) {
        // default(sql`now()`) — a plain SQL expression default.
        settings.push(`default: \`${value.template.text}\``);
      } else if (
        value &&
        (ts.isStringLiteral(value) ||
          ts.isNumericLiteral(value) ||
          [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
            value.kind
          ))
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
      const [fn] = call.args;
      if (
        !(
          fn &&
          ts.isArrowFunction(fn) &&
          ts.isPropertyAccessExpression(fn.body) &&
          ts.isIdentifier(fn.body.expression)
        )
      )
        fail(expression, "Dynamic foreign key target");
      const ref = (fn as ts.ArrowFunction).body as ts.PropertyAccessExpression;
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
        actions.push(`${key === "onDelete" ? "delete" : "update"}: ${act}`);
      }
      table.refs.push({
        actions: actions.join(", "),
        column: name,
        property: ref.name.text,
        target: ref.expression.getText(source),
      });
    } else if (!RUNTIME_ONLY_COLUMN_METHODS.has(call.name))
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
