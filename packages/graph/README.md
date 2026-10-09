# `@enops/atlas-graph`

In-memory schema graph engine for Enops Atlas. Build a graph from the
canonical schema IR, traverse neighborhoods, and analyze the impact of
breaking changes — deterministic and browser-safe.

Part of the [enops-atlas](https://github.com/santosh-marar/enops-atlas) OSS
monorepo. Depends on [`@enops/atlas-schema`](https://www.npmjs.com/package/@enops/atlas-schema).

## Install

```sh
npm install @enops/atlas-graph
```

## Usage

```ts
import { normalize, parseDbml } from "@enops/atlas-schema";
import {
  analyzeImpact,
  buildSchemaGraph,
  getNeighborhood,
  serializeNeighborhood,
} from "@enops/atlas-graph";

const { schema } = normalize(parseDbml(source));
const { graph, danglingEdges } = buildSchemaGraph(schema);

const { tables, truncated } = getNeighborhood(graph, ["public.users"], {
  hops: 2,
});

const report = analyzeImpact(schema, graph, {
  kind: "remove-column",
  schema: "public",
  table: "users",
  column: "email",
});
// report.severity === "breaking" | "safe", plus affected columns/constraints

const text = serializeNeighborhood(graph, tables);
```

## Main exports

| Export | Purpose |
| --- | --- |
| `buildSchemaGraph` | `CanonicalSchema` → `{ graph, danglingEdges }` |
| `SchemaGraph` / `SchemaGraphEngine` | graph class: nodes, adjacency, reverse adjacency, enums |
| `tableKey` | stable table identifier (for example `public.users`) |
| `getNeighborhood` | bounded N-hop traversal from start tables |
| `serializeNeighborhood` | LLM-friendly text projection of a subgraph |
| `analyzeImpact` | impact report for remove-table/column/enum changes |
| `DanglingEdgeError` | edges that reference missing tables |

Types: `BuildGraphResult`, `TableNode`, `Edge`, `NeighborhoodOptions`,
`NeighborhoodResult`, `ChangeRequest`, `ImpactResult`, `ImpactReport`,
`Severity`, `AffectedColumnRef`, `AffectedConstraintRef`.

## Development

```sh
pnpm --filter @enops/atlas-graph test
pnpm --filter @enops/atlas-graph typecheck
pnpm --filter @enops/atlas-graph build
```

## License

MIT
