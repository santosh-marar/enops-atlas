import type { SchemaChunk } from "./chunks";

// Hybrid schema retrieval ranking.
//
// Pure and deterministic so Atlas Cloud and Atlas OSS rank identically and
// so the ranking is unit-testable without a vector database. Semantic
// candidates come from Qdrant; exact-name candidates come from the chunk
// set; both are fused with reciprocal rank fusion and then lightly reranked
// by lexical overlap for relevance.

export interface SchemaSearchHit {
  chunkId: string;
  score: number;
}

export interface RankedSchemaHit {
  chunkId: string;
  score: number;
  /** Which retrieval channels contributed, e.g. ["exact", "semantic"]. */
  sources: string[];
}

export interface RankedList {
  hits: SchemaSearchHit[];
  source?: string;
  weight?: number;
}

const DEFAULT_RRF_K = 60;
/** A table/column exact name match should outrank a fuzzy semantic hit. */
const EXACT_LIST_WEIGHT = 1.4;

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

function nameScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase();
  if (!q) return 0;
  if (n === q) return 1;
  if (n.endsWith(`.${q}`)) return 0.9;
  if (n.startsWith(q) || n.endsWith(q)) return 0.6;
  if (n.includes(q)) return 0.4;
  const tokens = tokenize(name);
  if (tokens.includes(q)) return 0.5;
  return 0;
}

/**
 * Scores chunks by how well their name (and, weakly, their description)
 * matches the query. This is the "exact table/column search" channel.
 */
export function exactNameMatches(
  query: string,
  chunks: SchemaChunk[]
): SchemaSearchHit[] {
  const hits: SchemaSearchHit[] = [];
  for (const chunk of chunks) {
    const byName = nameScore(query, chunk.name);
    const byText = chunk.text.toLowerCase().includes(query.toLowerCase().trim())
      ? 0.2
      : 0;
    const score = Math.max(byName, byText);
    if (score > 0) hits.push({ chunkId: chunk.id, score });
  }
  return hits.sort(
    (a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId)
  );
}

/** Reciprocal rank fusion over any number of ranked channels. */
export function reciprocalRankFusion(
  lists: RankedList[],
  k = DEFAULT_RRF_K
): RankedSchemaHit[] {
  const fused = new Map<string, { score: number; sources: Set<string> }>();
  for (const list of lists) {
    const weight = list.weight ?? 1;
    list.hits.forEach((hit, index) => {
      const entry = fused.get(hit.chunkId) ?? { score: 0, sources: new Set() };
      entry.score += weight / (k + index + 1);
      if (list.source) entry.sources.add(list.source);
      fused.set(hit.chunkId, entry);
    });
  }
  return [...fused.entries()]
    .map(([chunkId, entry]) => ({
      chunkId,
      score: entry.score,
      sources: [...entry.sources].sort(),
    }))
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
}

/** Boosts hits whose chunk text overlaps the query terms (relevance scoring). */
export function rerankByRelevance(
  query: string,
  hits: RankedSchemaHit[],
  chunks: SchemaChunk[]
): RankedSchemaHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return hits;
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  return hits
    .map((hit) => {
      const chunk = byId.get(hit.chunkId);
      if (!chunk) return hit;
      const text = `${chunk.name} ${chunk.text}`.toLowerCase();
      const overlap = terms.filter((term) => text.includes(term)).length;
      const boost = 1 + 0.25 * (overlap / terms.length);
      return { ...hit, score: hit.score * boost };
    })
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
}

export interface HybridSchemaSearchInput {
  chunks: SchemaChunk[];
  k?: number;
  limit?: number;
  query: string;
  /** Semantic candidates from the vector store, best first. */
  semanticHits?: SchemaSearchHit[];
}

/**
 * Fuses exact-name and semantic channels, reranks by relevance, and returns
 * the top `limit` hits.
 */
export function hybridSchemaSearch(
  input: HybridSchemaSearchInput
): RankedSchemaHit[] {
  const { query, chunks, semanticHits = [], limit = 10, k } = input;
  const exact = exactNameMatches(query, chunks);
  const fused = reciprocalRankFusion(
    [
      { hits: exact, source: "exact", weight: EXACT_LIST_WEIGHT },
      { hits: semanticHits, source: "semantic" },
    ],
    k
  );
  return rerankByRelevance(query, fused, chunks).slice(0, limit);
}
