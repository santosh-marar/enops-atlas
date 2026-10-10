import { describe, expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { buildSchemaChunks } from "../rag/chunks";
import {
  exactNameMatches,
  hybridSchemaSearch,
  reciprocalRankFusion,
  rerankByRelevance,
} from "../rag/rank";

const dbml = [
  "Table users {",
  "  id uuid [pk]",
  "  email varchar(255) [unique, not null]",
  "  note text",
  "}",
  "",
  "Table orders {",
  "  id uuid [pk]",
  "  user_id uuid [ref: > users.id]",
  "  status order_status",
  "}",
  "",
  "Enum order_status {",
  "  pending",
  "  paid",
  "}",
].join("\n");

function canonicalSchema() {
  return normalize(parseDbml(dbml)).schema;
}

describe("schema RAG chunks", () => {
  test("builds table, column, relationship, and enum chunks", () => {
    const chunks = buildSchemaChunks(canonicalSchema(), { projectId: "p1" });
    const kinds = new Set(chunks.map((chunk) => chunk.kind));
    expect(kinds).toEqual(new Set(["table", "column", "relationship", "enum"]));

    const email = chunks.find((chunk) => chunk.column === "email");
    expect(email?.text).toContain("users.email");
    expect(email?.text).toContain("string(255)");
    expect(email?.text).toContain("unique");
    expect(email?.text).toContain("not null");

    const relationship = chunks.find((chunk) => chunk.kind === "relationship");
    expect(relationship?.text).toContain("references");
    expect(relationship?.refTable).toBe("users");

    const enumChunk = chunks.find((chunk) => chunk.kind === "enum");
    expect(enumChunk?.text).toContain("pending, paid");
  });

  test("produces deterministic, project-scoped ids", () => {
    const first = buildSchemaChunks(canonicalSchema(), { projectId: "p1" });
    const second = buildSchemaChunks(canonicalSchema(), { projectId: "p1" });
    const other = buildSchemaChunks(canonicalSchema(), { projectId: "p2" });

    expect(first.map((chunk) => chunk.id)).toEqual(
      second.map((chunk) => chunk.id)
    );
    expect(first.map((chunk) => chunk.id)).not.toEqual(
      other.map((chunk) => chunk.id)
    );
  });
});

describe("schema RAG ranking", () => {
  const chunks = buildSchemaChunks(canonicalSchema(), { projectId: "p1" });

  test("ranks exact table/column names first", () => {
    const hits = exactNameMatches("users", chunks);
    expect(hits[0]?.chunkId).toBe(
      chunks.find((chunk) => chunk.kind === "table" && chunk.name === "users")
        ?.id
    );

    const columnHit = exactNameMatches("users.email", chunks);
    expect(columnHit[0]?.chunkId).toBe(
      chunks.find((chunk) => chunk.column === "email")?.id
    );
  });

  test("fuses channels with reciprocal rank fusion", () => {
    const fused = reciprocalRankFusion([
      { hits: [{ chunkId: "a", score: 1 }], source: "exact" },
      {
        hits: [
          { chunkId: "b", score: 1 },
          { chunkId: "a", score: 0.5 },
        ],
        source: "semantic",
      },
    ]);
    expect(fused[0]?.chunkId).toBe("a");
    expect(fused[0]?.sources).toEqual(["exact", "semantic"]);
  });

  test("hybrid search blends exact and semantic candidates", () => {
    const usersChunk = chunks.find(
      (chunk) => chunk.kind === "table" && chunk.name === "users"
    )!;
    const enumChunk = chunks.find((chunk) => chunk.kind === "enum")!;

    const hits = hybridSchemaSearch({
      chunks,
      query: "users",
      semanticHits: [{ chunkId: enumChunk.id, score: 0.99 }],
    });
    expect(hits[0]?.chunkId).toBe(usersChunk.id);
    expect(hits.map((hit) => hit.chunkId)).toContain(enumChunk.id);
  });

  test("relevance rerank boosts chunks whose text overlaps the query", () => {
    const emailChunk = chunks.find((chunk) => chunk.column === "email")!;
    const enumChunk = chunks.find((chunk) => chunk.kind === "enum")!;
    const reranked = rerankByRelevance(
      "unique email column",
      [
        { chunkId: enumChunk.id, score: 1, sources: ["semantic"] },
        { chunkId: emailChunk.id, score: 1, sources: ["semantic"] },
      ],
      chunks
    );
    expect(reranked[0]?.chunkId).toBe(emailChunk.id);
  });
});
