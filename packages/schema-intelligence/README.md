# `@enops/atlas-schema-intelligence`

The shared schema engine for Atlas Cloud and Atlas OSS. DBML remains the
editable source; canonical schema v2 is the versioned reasoning contract.

## Runtime boundaries

- `@enops/atlas-schema-intelligence` is the browser-safe deterministic core:
  parsing, canonicalization, validation, snapshots, diffs, in-memory graph
  traversal, impact analysis and checked DBML rendering.
- `@enops/atlas-schema-intelligence/ai` contains the shared planning and generation
  workflow. It requires an injected `SchemaModel`; it does not select a vendor
  or call the Enops backend itself.
- `@enops/atlas-schema-intelligence/node` contains repository discovery and source
  adapters that require a Node-compatible filesystem. The Drizzle adapter uses
  the TypeScript compiler API, so this entry also requires an installed
  `typescript` ^5 or ^6 (declared as an optional peer dependency).

The package depends only on the sibling Atlas core packages
(`@enops/atlas-schema` and `@enops/atlas-graph`). Cloud and OSS provide
adapters from outside this package: model implementations, persistence,
queues, credentials and UI remain application concerns. The package can be
consumed by either product without bringing those application dependencies
along.

Atlas Cloud injects its own `SchemaModel` implementation. Atlas OSS injects
its browser/local model adapter. Both therefore execute the same prompts,
validation, graph scoping and bounded retry rules.

```sh
npm install @enops/atlas-schema-intelligence
```

```ts
import {
  buildSchemaGraph,
  getNeighborhood,
  normalize,
  parseDbml,
} from "@enops/atlas-schema-intelligence";
import { generateDbmlPipeline } from "@enops/atlas-schema-intelligence/ai";

const canonical = normalize(parseDbml(source)).schema;
const { graph } = buildSchemaGraph(canonical);
const neighborhood = getNeighborhood(graph, ["public.users"], { hops: 2 });

const generated = await generateDbmlPipeline({
  model: mySchemaModel,
  prompt: "Add organizations and memberships",
  system: "Return complete DBML",
  maxRetries: 1,
});
```

## Safety boundary

This package produces canonical v2 and checked DBML. PostgreSQL SQL, Prisma 6, and Drizzle writers live in `@enops/atlas-generators`; the foundation capability assessor only provides its own DBML export. Source readers do not imply cross-dialect translation. The AI workflow produces a proposal and bounded repair
attempts. Product code remains responsible for explicit human approval before
persisting or applying changes.

Live PostgreSQL and MySQL 8 introspection preserves enums, native types, exact defaults, ordered keys, names, indexes, checks, and foreign-key actions. Features absent from canonical v2 fail explicitly, including views, partitioning, generated columns, RLS, advanced index options, and deferrable/exclusion constraints. Introspection reads metadata only and is available through the Node-only `./introspection` entry. Repository discovery is bounded by depth, directory count, file count, and total bytes.

## Verification

```sh
bun run test
bun run typecheck
bun run check:boundary
bun run check:browser
```

The browser check bundles both the core and AI entries and rejects Node or
private Enops imports. The package is published as `@enops/atlas-schema-intelligence`
under the MIT license from the [enops-atlas](https://github.com/santosh-marar/enops-atlas)
repository.
