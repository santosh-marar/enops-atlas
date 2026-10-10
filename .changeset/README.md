# Changesets

This folder is managed by [`@changesets/cli`](https://github.com/changesets/changesets).

- The four libraries (`@enops/atlas-schema`, `@enops/atlas-graph`,
  `@enops/atlas-generators`, `@enops/atlas-schema-intelligence`) are a
  **fixed group**: they always share one version and release together.
- Add a changeset with `pnpm changeset`, release with the `Release` workflow.
