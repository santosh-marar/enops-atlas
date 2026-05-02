function DBMLHighlighter({ code }: { code: string }) {
  const lines = code.split("\n");

  const tokenize = (line: string) => {
    const parts: { text: string; color: string }[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // comment
      if (remaining.match(/^\/\/.*/)) {
        parts.push({ text: remaining, color: "#71717a" });
        break;
      }

      // keywords
      const keyword = remaining.match(
        /^(Table|Ref|Enum|indexes|ref|pk|null|not null|unique|default|note|as|headercolor)\b/i
      );
      if (keyword) {
        parts.push({ text: keyword[0], color: "#c084fc" });
        remaining = remaining.slice(keyword[0].length);
        continue;
      }

      // types
      const type = remaining.match(
        /^(int|integer|varchar|text|boolean|bool|uuid|timestamp|date|time|float|decimal|bigint|serial|json|jsonb|enum)\b/i
      );
      if (type) {
        parts.push({ text: type[0], color: "#67e8f9" });
        remaining = remaining.slice(type[0].length);
        continue;
      }

      // backtick string
      const backtick = remaining.match(/^`[^`]*`/);
      if (backtick) {
        parts.push({ text: backtick[0], color: "#86efac" });
        remaining = remaining.slice(backtick[0].length);
        continue;
      }

      // string
      const str = remaining.match(/^"[^"]*"|^'[^']*'/);
      if (str) {
        parts.push({ text: str[0], color: "#86efac" });
        remaining = remaining.slice(str[0].length);
        continue;
      }

      // number
      const num = remaining.match(/^\d+/);
      if (num) {
        parts.push({ text: num[0], color: "#fb923c" });
        remaining = remaining.slice(num[0].length);
        continue;
      }

      // operator
      const op = remaining.match(/^[<>\-<>]+/);
      if (op) {
        parts.push({ text: op[0], color: "#94a3b8" });
        remaining = remaining.slice(op[0].length);
        continue;
      }

      // brackets
      const bracket = remaining.match(/^[{}()[\]]/);
      if (bracket) {
        parts.push({ text: bracket[0], color: "#e4e4e7" });
        remaining = remaining.slice(1);
        continue;
      }

      // identifier or fallback
      const ident = remaining.match(/^[^\s{}()[\]<>\-"'`]+/);
      if (ident) {
        parts.push({ text: ident[0], color: "#e4e4e7" });
        remaining = remaining.slice(ident[0].length);
        continue;
      }

      // whitespace
      parts.push({ text: remaining[0], color: "#e4e4e7" });
      remaining = remaining.slice(1);
    }

    return parts;
  };

  return (
    <pre
      style={{
        background: "#27272a",
        borderRadius: "0.5rem",
        padding: "1rem",
        overflowX: "auto",
        fontSize: "0.8rem",
        lineHeight: "1.6",
      }}
    >
      <code>
        {lines.map((line, i) => (
          <div key={i}>
            {tokenize(line).map((token, j) => (
              <span key={j} style={{ color: token.color }}>
                {token.text}
              </span>
            ))}
          </div>
        ))}
      </code>
    </pre>
  );
}

export default DBMLHighlighter;
