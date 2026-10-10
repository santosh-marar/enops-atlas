import type { NormalizedSchema } from "@enops/atlas-schema";
import { normalize } from "@enops/atlas-schema";
import { buildSchemaGraph } from "./build";
import type { Edge, SchemaGraph as GraphData } from "./types";

/**
 * Class wrapper over the functional graph module. The validator (and the
 * AI generation pipeline) expect a `SchemaGraph` instance with
 * `detectCycles()` / `getIsolatedTables()`; this adapts the plain
 * data-structure returned by `buildSchemaGraph` to that API.
 */
export class SchemaGraph {
  readonly adjacency: GraphData["adjacency"];
  readonly databaseType: GraphData["databaseType"];
  readonly dialect: GraphData["dialect"];
  readonly enums: GraphData["enums"];
  readonly nodes: GraphData["nodes"];
  readonly reverseAdjacency: GraphData["reverseAdjacency"];
  readonly version: GraphData["version"];

  constructor(schema: NormalizedSchema) {
    const { schema: canonical } = normalize(schema);
    const { graph } = buildSchemaGraph(canonical);
    this.adjacency = graph.adjacency;
    this.databaseType = graph.databaseType;
    this.dialect = graph.dialect;
    this.enums = graph.enums;
    this.nodes = graph.nodes;
    this.reverseAdjacency = graph.reverseAdjacency;
    this.version = graph.version;
  }

  /**
   * Finds multi-table FK cycles. Self-references are valid hierarchical
   * patterns and are not reported. Returns each cycle as a list of table
   * keys, e.g. ["public.users", "public.teams"].
   */
  detectCycles(): string[][] {
    // Tarjan's SCC, iterative.
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    let counter = 0;

    const strongConnect = (start: string) => {
      const call: { node: string; edgeIdx: number }[] = [
        { edgeIdx: 0, node: start },
      ];
      while (call.length > 0) {
        const frame = call.at(-1) as { node: string; edgeIdx: number };
        const v = frame.node;

        if (frame.edgeIdx === 0) {
          index.set(v, counter);
          low.set(v, counter);
          counter += 1;
          stack.push(v);
          onStack.add(v);
        }

        const edges: Edge[] = this.adjacency.get(v) ?? [];
        let descended = false;
        while (frame.edgeIdx < edges.length) {
          const w = edges[frame.edgeIdx]?.to;
          if (w === undefined) {
            frame.edgeIdx += 1;
            continue;
          }
          frame.edgeIdx += 1;
          if (!index.has(w)) {
            call.push({ edgeIdx: 0, node: w });
            descended = true;
            break;
          }
          if (onStack.has(w)) {
            low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
          }
        }

        if (descended) continue;

        // All descendants processed — check root of an SCC.
        if (low.get(v) === index.get(v)) {
          const component: string[] = [];
          let w: string | undefined;
          do {
            w = stack.pop();
            if (w === undefined) break;
            onStack.delete(w);
            component.push(w);
          } while (w !== v);
          // Only multi-table SCCs are cycles. A single-node component is
          // either an isolated table or a self-referencing FK (manager_id →
          // users.id) — a standard pattern, NOT a circular-reference error.
          if (component.length > 1) {
            cycles.push(component);
          }
        }

        call.pop();
        if (call.length > 0) {
          const parent = call.at(-1) as { node: string };
          low.set(
            parent.node,
            Math.min(low.get(parent.node) ?? 0, low.get(v) ?? 0)
          );
        }
      }
    };

    for (const node of this.nodes.keys()) {
      if (!index.has(node)) strongConnect(node);
    }
    return cycles;
  }

  /**
   * Tables with no foreign keys in or out — candidates for the
   * ISOLATED_TABLE warning.
   */
  getIsolatedTables(): string[] {
    const isolated: string[] = [];
    for (const key of this.nodes.keys()) {
      if (
        (this.adjacency.get(key)?.length ?? 0) === 0 &&
        (this.reverseAdjacency.get(key) ?? []).length === 0
      ) {
        isolated.push(key);
      }
    }
    return isolated;
  }
}
