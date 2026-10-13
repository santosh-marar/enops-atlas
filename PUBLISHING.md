# Publishing `@enops/atlas-*` to npm

Four library packages are published from this repo. Everything else is private and is never published.

| Package | Source | Version | Notes |
| --- | --- | --- | --- |
| `@enops/atlas-schema` | `packages/schema` | see npm | DBML parsing, canonical schema model, renderer, diff |
| `@enops/atlas-graph` | `packages/graph` | see npm | Schema graph, neighbourhood and impact analysis |
| `@enops/atlas-generators` | `packages/generators` | see npm | SQL / Prisma / Drizzle / seed SQL generators |
| `@enops/atlas-schema-intelligence` | `packages/schema-intelligence` | see npm | Browser-safe intelligence + live introspection (subpaths `./ai`, `./introspection`, `./node`) |

Not published (all `"private": true`): root `enops-atlas`, `web` (`apps/web`), `@enops/atlas-ui` (`packages/ui`), `@workspace/typescript-config` (`packages/typescript-config`).

Each package is versioned **independently** — a changeset for one package bumps only that package.

The libraries depend on each other through `workspace:^`. pnpm rewrites that to the published semver range; if a library's new version falls outside a dependent's range, changesets bumps the dependent automatically.

## One-time setup

1. **npm account with 2FA enabled.**
2. **Own the `@enops` scope.** Scoped packages can only be published by the scope owner. Create a free org named `enops` at <https://www.npmjs.com/org/create> and add yourself as owner. If you do not want the org, rename every package (and every `workspace:^` dependency) to a scope you already own.
3. **Log in locally:** `npm login`
4. **CI auth** — `.github/workflows/release-npm-packages.yml` publishes through changesets. Pick one:
   - **Trusted publishing (recommended):** on npmjs.com, for each of the four packages → Settings → Trusted Publisher → GitHub Actions, repository `santosh-marar/enops-atlas`, workflow `release-npm-packages.yml`. No npm secret is needed; provenance is enabled (`id-token: write` is set). Configure permission for direct `npm publish`, which is the operation used by the release command. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the required setup.
   - **Token (not used now):** the workflow no longer passes an npm token. If trusted publishing is ever not possible, add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` back to the release step and store a granular token as the `NPM_TOKEN` repository secret.
   - For packages not yet created on npm, complete an authenticated first publish before configuring per-package trusted publishing. This machine must be logged in and authorized to publish under `@enops` for a local release.
5. **Bun 1.3.13** is required for tests, including local releases. CI installs it explicitly.

## Versioning with changesets

```bash
pnpm changeset          # select only the package(s) you changed, pick patch/minor/major
git add .changeset && git commit -m "chore: add changeset"
```

Example — bump a single package from 1.2.3 to 1.2.4:

```bash
pnpm changeset          # select @enops/atlas-schema only → patch
pnpm version-packages   # applies 1.2.3 → 1.2.4 + changelog entry
```

The other packages stay untouched. If a changed package is a dependency of another
one and the new version falls outside its range, changesets bumps the dependent
too (because of `updateInternalDependencies: "patch"`).

Run `pnpm version-packages` locally, commit the version bump, and push to `main`. The "Release npm packages" workflow first waits for the complete reusable CI workflow (Node 22/24, browser tests, and live database tests). It then runs `pnpm release`, which checks that no changesets are still pending, runs package validation and the production audit, and publishes every package whose version npm does not have yet. Nothing is published when no version changed.

## Manual release (first release or hotfix)

```bash
npm login
npm whoami
pnpm install --frozen-lockfile
pnpm changeset status   # review the planned package versions
pnpm version-packages   # apply versions and changelogs, then review the changes
pnpm release:check      # refuses release while unapplied changesets remain
pnpm build:packages     # dist/ is ignored; build before checking package artifacts
pnpm check:packages
pnpm smoke
# After release approval and committing the reviewed changes:
pnpm release
```

Rules:
- **Always publish with pnpm**, never `npm publish` inside a workspace package — pnpm rewrites `workspace:^` to real semver, npm would publish the literal `workspace:^`.
- `changeset publish` also creates git tags. If you must publish without changesets:
  `pnpm build:packages && pnpm -r --filter "@enops/atlas-*" publish --access public --no-git-checks`

## Verify a release

```bash
npm view @enops/atlas-schema version
npm view @enops/atlas-schema-intelligence version
```

Pull requests also get preview builds through `pkg-pr-new` (`.github/workflows/preview.yml`).

## Pre-publish checklist

- [ ] `pnpm check` clean
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build:packages` succeeds
- [ ] `pnpm check:packages` all green (publint + attw)
- [ ] `pnpm smoke` passes
- [ ] `pnpm api:check` passes (public API snapshot)
- [ ] changesets applied; versions and changelogs reviewed; `pnpm release:check` passes
- [ ] logged in (local) or CI auth configured (trusted publishing / `NPM_TOKEN`)
- [ ] `@enops` scope exists on npm and you own it

## Troubleshooting

| Error | Fix |
| --- | --- |
| `404 Not Found - Scope not found` | The `@enops` org does not exist or you are not a member. Create it or rename the scope. |
| `need auth` / `EOTP` | `npm login` locally; in CI use a granular token or trusted publishing. |
| Tarball contains `workspace:^` deps | You used `npm publish` instead of `pnpm publish` / `changeset publish`. |
| `dist` missing from tarball | Run `pnpm build:packages` first — `dist/` is gitignored. |
| Provenance error in CI | Give the token publish rights, or use trusted publishing (`id-token: write` is already set). |
| `npm warn Unknown env config "manage-package-manager-versions"` | Cosmetic warning from npm run through pnpm; ignore. |

All packages are ESM-only (`"type": "module"`) with typed `exports`. `publint` and `attw` (`pnpm check:packages`) are the source of truth for module-resolution problems.
