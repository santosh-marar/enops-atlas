# `@enops/atlas-schema`

Canonical schema IR for Enops Atlas. Parse DBML, normalize it into one
canonical shape, validate it, diff versions, and hash it — deterministic,
framework-independent and browser-safe.

Part of the [enops-atlas](https://github.com/santosh-marar/enops-atlas) OSS
monorepo. Used by `@enops/atlas-graph`, `@enops/atlas-generators`,
and `@enops/atlas-schema-intelligence`.

## Install

```sh
npm install @enops/atlas-schema
```

## Usage

```ts
import {
  canonicalDigest,
  diffSchemas,
  normalize,
  parseDbml,
  renderDbml,
  validateCanonicalStructure,
} from "@enops/atlas-schema";

const source = `
Table users {
  id int [pk]
  email varchar [unique]
}

Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}
`;

const parsed = parseDbml(source);
const { schema, errors } = normalize(parsed);
if (errors.length) throw new Error(JSON.stringify(errors));

const issues = validateCanonicalStructure(schema);
const digest = canonicalDigest(schema); // stable content hash
const dbml = renderDbml(schema); // canonical -> DBML
const diff = diffSchemas(schema, otherSchema);
```

## Pipeline

```
DBML text ──parseDbml──► ParsedSchema ──normalize──► CanonicalSchema
                                                       │
                                                       ├─ canonicalDigest
                                                       ├─ validateCanonicalStructure
                                                       ├─ diffSchemas
                                                       └─ renderDbml
```

- **One truth for many inputs.** DBML, Prisma, Drizzle and live introspection
  all reduce to the same tables/columns/refs/enums.
- **Stable identity.** `canonicalDigest(schema)` is a content hash: same
  schema, same digest, so decisions can be bound to an exact artifact.
- **`unsupported` is a first-class outcome.** Types the system cannot
  represent are reported as diagnostics, never silently guessed or dropped.

## Main exports

| Export | Purpose |
| --- | --- |
| `parseDbml` | DBML text → `ParsedSchema` |
| `normalize` | `ParsedSchema` → `CanonicalSchema` (+ errors) |
| `renderDbml` | `CanonicalSchema` → DBML text |
| `validateCanonicalStructure` | typed structural diagnostics |
| `diffSchemas` | table/column/enum diff between two canonical schemas |
| `canonicalDigest` | stable content hash of a canonical schema |
| `canonicalProjection`, `stableValue` | canonical JSON projection helpers |
| `assessSchemaTarget`, `exportCanonicalDbml` | target capability + DBML export |
| `sqlToDbml`, `dbmlToSql` | SQL ↔ DBML interop (postgres/mysql/mssql/oracle) |
| `sha256Hex` | hash helper |
| `quoteName`, `quoteString`, `quoteExpression`, `numericDefaultLiteral` | dialect-aware literals |

Types: `CanonicalSchema`, `CanonicalTable`, `CanonicalColumn`,
`CanonicalForeignKey`, `CanonicalIndex`, `CanonicalEnum`, `CanonicalType`,
`ParsedSchema`, `TableSchema`, `SchemaDiagnostic`, `SchemaTarget`, and more.
DBML-layer duplicates are exported with a `Dbml` prefix (for example
`DbmlColumnDefault`).

## Development

```sh
pnpm --filter @enops/atlas-schema test
pnpm --filter @enops/atlas-schema typecheck
pnpm --filter @enops/atlas-schema build
```

## License

MIT
