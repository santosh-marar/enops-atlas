/** Mask quoted strings, expressions and comments without changing offsets.
 * This operates only on a parser-provided field span, not as a DBML parser.
 */
function maskNonSyntax(source: string): string {
  return source.replace(
    /'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (token) => " ".repeat(token.length)
  );
}

export function numericDefaultLiteral(source: string): string {
  const matches = [
    ...maskNonSyntax(source).matchAll(
      /\bdefault\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?=\s*[,\]])/g
    ),
  ];
  if (matches.length !== 1)
    throw new Error(
      "Cannot recover exact numeric default from source; refusing lossy parsing"
    );
  return matches[0]![1]!;
}

export function quoteName(value: string): string {
  // Preserve simple identifiers for existing consumers; quote everything else.
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : JSON.stringify(value);
}

export function quoteString(value: string): string {
  return JSON.stringify(value);
}

export function quoteExpression(value: string): string {
  // Do not invent escaping rules for arbitrary SQL. Unsupported quoting blocks export.
  if (value.includes("`"))
    throw new Error(
      "Expression containing a backtick cannot be safely rendered as DBML"
    );
  return `\`${value}\``;
}
