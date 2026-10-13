# Releasing to npm

Releases publish from GitHub Actions with npm trusted publishing: there is no
npm token to store or rotate, and no 2-step code to type.

## One-time setup (per package, on npmjs.com)

For each of `@enops/atlas-schema`, `@enops/atlas-graph`,
`@enops/atlas-generators` and `@enops/atlas-schema-intelligence`:

1. Open the package on npmjs.com, then **Settings**, then **Trusted Publisher**.
2. Choose **GitHub Actions** and enter:
   - Organization or user: `santosh-marar`
   - Repository: `enops-atlas`
   - Workflow filename: `release.yml`
   - Environment: leave empty
3. Save.

Optionally, under **Publishing access**, choose "Require two-factor
authentication and disallow tokens", so only this workflow can publish.

## Releasing

1. Add a changeset with each change: `pnpm changeset`.
2. Merge to `main`. The Release workflow runs the checks, then opens or
   updates a "chore: release" pull request that bumps versions and changelogs.
3. Merge that pull request. The workflow runs `pnpm release` again, which
   publishes every package whose version is not on npm yet.

The repository is in changesets pre mode (`beta`), so versions are
`0.1.0-beta.N` and publish under the `beta` tag.
