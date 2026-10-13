/**
 * Merging a partial DBML answer into an existing schema.
 *
 * Asking the model to rewrite a whole schema for a small change is slow, costs
 * tokens, and risks changes nobody asked for. Instead it writes only the
 * tables it adds or changes, and they are merged into the current schema here.
 * The split is a small scanner (not a full parser): it only has to find where
 * each top-level block starts and ends, so it follows strings and comments.
 */

export type DbmlBlockKind =
  | "table"
  | "enum"
  | "tablegroup"
  | "ref"
  | "project"
  | "note"
  | "tablepartial";

export interface DbmlBlock {
  /** Identity for blocks that can be replaced: "table:public.users". Refs use their text. */
  key: string;
  kind: DbmlBlockKind;
  text: string;
}

const KEYWORDS: Record<string, DbmlBlockKind> = {
  enum: "enum",
  note: "note",
  project: "project",
  ref: "ref",
  table: "table",
  tablegroup: "tablegroup",
  tablepartial: "tablepartial",
};

const WORD = /[A-Za-z_]/;

/** Index just past a quoted string starting at `start`, or the text end. */
function skipString(text: string, start: number): number {
  const quote = text[start];
  if (text.startsWith("'''", start)) {
    const end = text.indexOf("'''", start + 3);
    return end === -1 ? text.length : end + 3;
  }
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") i += 2;
    else if (text[i] === quote) return i + 1;
    else i += 1;
  }
  return text.length;
}

/** Index just past a comment starting at `start`, or `start` if there is none. */
function skipComment(text: string, start: number): number {
  if (text.startsWith("//", start)) {
    const end = text.indexOf("\n", start);
    return end === -1 ? text.length : end;
  }
  if (text.startsWith("/*", start)) {
    const end = text.indexOf("*/", start + 2);
    return end === -1 ? text.length : end + 2;
  }
  return start;
}

/** Index just past the `{ ... }` that opens at or after `from`, or -1. */
function skipBraces(text: string, from: number): number {
  let i = text.indexOf("{", from);
  if (i === -1) return -1;
  let depth = 0;
  while (i < text.length) {
    const char = text[i];
    const afterComment = skipComment(text, i);
    if (afterComment !== i) {
      i = afterComment;
    } else if (char === "'" || char === '"' || char === "`") {
      i = skipString(text, i);
    } else {
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
  }
  return -1;
}

/** "ecommerce.merchants" -> same; "users" -> "public.users"; quotes and case ignored. */
function nameKey(header: string): string {
  const name = header
    .replace(/\s+as\s+\S+.*$/is, "")
    .replace(/\[.*$/s, "")
    .replace(/["'`]/g, "")
    .trim()
    .toLowerCase();
  return name.includes(".") ? name : `public.${name}`;
}

/** The top-level blocks of a DBML text, in order. Comments between them are dropped. */
export function splitDbml(text: string): DbmlBlock[] {
  const blocks: DbmlBlock[] = [];
  let i = 0;
  while (i < text.length) {
    const afterComment = skipComment(text, i);
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }
    if (!WORD.test(text[i] ?? "")) {
      i += 1;
      continue;
    }
    let end = i;
    while (end < text.length && /[A-Za-z_]/.test(text[end] ?? "")) end += 1;
    const kind = KEYWORDS[text.slice(i, end).toLowerCase()];
    if (!kind) {
      // Not a block keyword: skip the word so it is not mistaken for one.
      i = end;
      continue;
    }

    if (kind === "ref") {
      const lineEnd = text.indexOf("\n", end);
      const rest = text.slice(end, lineEnd === -1 ? text.length : lineEnd);
      if (!rest.includes("{") && /^\s*[\w."`]*\s*:/.test(rest)) {
        const line = text.slice(i, lineEnd === -1 ? text.length : lineEnd);
        blocks.push({ key: `ref:${normalizeSpace(line)}`, kind, text: line });
        i = lineEnd === -1 ? text.length : lineEnd;
        continue;
      }
    }

    const close = skipBraces(text, end);
    if (close === -1) {
      // Unterminated: keep what is left as one block so the parser reports it.
      blocks.push({ key: `broken:${i}`, kind, text: text.slice(i) });
      break;
    }
    const brace = text.indexOf("{", end);
    const block = text.slice(i, close);
    const key =
      kind === "ref" || kind === "project" || kind === "note"
        ? `${kind}:${normalizeSpace(block)}`
        : `${kind}:${nameKey(text.slice(end, brace))}`;
    blocks.push({ key, kind, text: block });
    i = close;
  }
  return blocks;
}

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

const REPLACEABLE = new Set<DbmlBlockKind>(["table", "enum", "tablegroup"]);

/**
 * Applies a partial answer to the current schema: a table (or enum) the answer
 * defines replaces the one with the same name, a new one is added at the end,
 * and a standalone Ref is added unless it is already there. Everything the
 * answer does not mention is kept exactly as it was.
 *
 * Returns null when the answer holds nothing mergeable.
 */
export function mergeDbml(existing: string, partial: string): string | null {
  const additions = splitDbml(partial).filter(
    (block) => REPLACEABLE.has(block.kind) || block.kind === "ref"
  );
  if (additions.length === 0) return null;

  const blocks = splitDbml(existing);
  for (const addition of additions) {
    const at = blocks.findIndex((block) => block.key === addition.key);
    if (at === -1) {
      blocks.push(addition);
    } else if (addition.kind !== "ref") blocks[at] = addition;
  }
  return `${blocks.map((block) => block.text).join("\n\n")}\n`;
}

/** How many tables a DBML text defines (0 if it cannot be split). */
export const countTables = (dbml: string) =>
  splitDbml(dbml).filter((block) => block.kind === "table").length;
