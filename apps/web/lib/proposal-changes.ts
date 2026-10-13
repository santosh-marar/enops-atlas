import { diffSchemas } from "@enops/atlas-schema";
import { analyzeDbml } from "./atlas";

/** One table or enum the proposal adds, changes or removes, as DBML. */
export interface ProposalChange {
  /** The block after the change; missing for something removed. */
  after?: string;
  /** The block before the change; missing for something new. */
  before?: string;
  kind: "added" | "changed" | "removed";
  /** "schema.name", or the bare name in the public schema. */
  name: string;
  type: "enum" | "table";
}

interface Block {
  /** "schema.name" with quotes removed. */
  key: string;
  keyword: "enum" | "ref" | "table";
  text: string;
}

const STRING_END: Record<string, string> = { "'": "'", '"': '"', "`": "`" };

/** Index just past the string or comment that starts at `at`, or `at` if none does. */
function skipQuoted(source: string, at: number): number {
  if (source.startsWith("'''", at)) {
    const end = source.indexOf("'''", at + 3);
    return end < 0 ? source.length : end + 3;
  }
  if (source.startsWith("//", at)) {
    const end = source.indexOf("\n", at);
    return end < 0 ? source.length : end;
  }
  if (source.startsWith("/*", at)) {
    const end = source.indexOf("*/", at + 2);
    return end < 0 ? source.length : end + 2;
  }
  const close = STRING_END[source[at] ?? ""];
  if (!close) return at;
  let i = at + 1;
  while (i < source.length && source[i] !== close) {
    i += source[i] === "\\" ? 2 : 1;
  }
  return i + 1;
}

function blockKey(header: string): string {
  const name = header
    .trim()
    .split(/\s+as\s+|\s*\[|\s+/i)[0]
    ?.replaceAll('"', "");
  if (!name) return "";
  return name.includes(".") ? name : `public.${name}`;
}

/** The top-level Table, Enum and Ref blocks of a DBML text, as written. */
export function dbmlBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let start = -1;
  let keyword: Block["keyword"] | null = null;
  let header = "";
  let i = 0;
  while (i < source.length) {
    const skipped = skipQuoted(source, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const char = source[i];
    if (depth === 0 && keyword === null) {
      const match = /^(table|enum|ref)\b([^{\n]*)/i.exec(source.slice(i));
      const atLineStart = i === 0 || source[i - 1] === "\n";
      if (match?.[1] && atLineStart) {
        keyword = match[1].toLowerCase() as Block["keyword"];
        header = match[2] ?? "";
        start = i;
        // A one-line Ref has no body.
        if (keyword === "ref" && header.includes(":")) {
          const end = source.indexOf("\n", i);
          const stop = end < 0 ? source.length : end;
          blocks.push({ key: "", keyword, text: source.slice(i, stop) });
          keyword = null;
          i = stop;
          continue;
        }
        i += match[0].length;
        continue;
      }
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && keyword !== null) {
        blocks.push({
          key: keyword === "ref" ? "" : blockKey(header),
          keyword,
          text: source.slice(start, i + 1),
        });
        keyword = null;
      }
    }
    i += 1;
  }
  return blocks;
}

/** The tables a Ref statement joins, as "schema.name". */
function refTables(text: string): string[] {
  // A one-line Ref has its endpoints after the colon, a block Ref in braces.
  const body = (
    text.includes("{")
      ? text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"))
      : text.slice(text.indexOf(":") + 1)
  ).replace(/\[[^\]]*\]/g, "");
  return body
    .split(/<>|[<>-]/)
    .map((end) => end.replace(/[{}"]/g, "").trim().split("."))
    .filter((parts) => parts.length >= 2)
    .map((parts) =>
      parts.length >= 3 ? `${parts[0]}.${parts[1]}` : `public.${parts[0]}`
    );
}

/** Standalone Ref statements that join a table, for showing next to it. */
function refsOf(blocks: Block[], key: string): string[] {
  return blocks
    .filter((block) => block.keyword === "ref")
    .map((block) => block.text.trim())
    .filter((text) => refTables(text).includes(key));
}

function blockText(blocks: Block[], key: string, type: "enum" | "table") {
  const block = blocks.find(
    (candidate) => candidate.keyword === type && candidate.key === key
  );
  if (!block) return;
  if (type === "enum") return block.text;
  return [block.text, ...refsOf(blocks, key)].join("\n");
}

const display = (key: string) =>
  key.startsWith("public.") ? key.slice("public.".length) : key;

/**
 * Only what the proposal changes: each added, changed or removed table and
 * enum, with its DBML before and after as written. Decided from the schemas'
 * meaning, so a table that was only reformatted is not listed.
 */
export function proposalChanges(
  beforeDbml: string,
  afterDbml: string
): ProposalChange[] {
  const diff = diffSchemas(
    analyzeDbml(beforeDbml).canonical,
    analyzeDbml(afterDbml).canonical
  );
  const before = dbmlBlocks(beforeDbml);
  const after = dbmlBlocks(afterDbml);
  const keyOf = (item: { name: string; schema: string }) =>
    `${item.schema}.${item.name}`;
  const change = (
    kind: ProposalChange["kind"],
    type: ProposalChange["type"],
    key: string
  ): ProposalChange => ({
    after: kind === "removed" ? undefined : blockText(after, key, type),
    before: kind === "added" ? undefined : blockText(before, key, type),
    kind,
    name: display(key),
    type,
  });
  return [
    ...diff.addedTables.map((t) => change("added", "table", keyOf(t))),
    ...diff.modifiedTables.map((t) => change("changed", "table", t.tableKey)),
    ...diff.removedTables.map((t) => change("removed", "table", keyOf(t))),
    ...diff.addedEnums.map((e) => change("added", "enum", keyOf(e))),
    ...diff.modifiedEnums.map((e) => change("changed", "enum", keyOf(e))),
    ...diff.removedEnums.map((e) => change("removed", "enum", keyOf(e))),
  ];
}
