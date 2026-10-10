import type { SchemaGraph } from "./types";

export interface NeighborhoodOptions {
  hops: number;
  maxNodes?: number;
}

export interface NeighborhoodResult {
  tables: Set<string>; // tableKeys
  truncated: boolean;
}

/**
 * BFS outward from startTables (tableKeys), following both directions,
 * capped by hops and maxNodes. Cycle-safe via the visited set — a
 * self-referencing FK or a multi-table cycle terminates naturally.
 */
export function getNeighborhood(
  graph: SchemaGraph,
  startTables: string[],
  options: NeighborhoodOptions
): NeighborhoodResult {
  const { hops, maxNodes = 40 } = options;

  const visited = new Set<string>(
    startTables.filter((t) => graph.nodes.has(t))
  );
  let frontier = new Set<string>(visited);
  let truncated = false;

  for (let i = 0; i < hops; i += 1) {
    if (visited.size >= maxNodes) {
      truncated = true;
      break;
    }

    const next = new Set<string>();
    for (const key of frontier) {
      const out = graph.adjacency.get(key) ?? [];
      const inc = graph.reverseAdjacency.get(key) ?? [];
      for (const e of [...out, ...inc]) {
        const neighbor = e.from === key ? e.to : e.from;
        if (visited.has(neighbor)) continue;
        if (visited.size + next.size >= maxNodes) {
          truncated = true;
          continue;
        }
        next.add(neighbor);
      }
    }

    for (const n of next) visited.add(n);
    if (next.size === 0) break;
    frontier = next;
  }

  return { tables: visited, truncated };
}
