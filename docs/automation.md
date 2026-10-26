# Automation Pipeline

The project uses one workflow to automatically detect, repack, version, and publish new upstream releases.

## Workflows

### `check-updates.yml` — Daily update and release

- Runs on a cron schedule (daily at 06:00 UTC) and on `workflow_dispatch`
- Compares the declared `dayjs` devDependency against `npm view dayjs version`
- When a new version is available, it:
  1. Pins the dependency to the new upstream version
  2. Creates an upstream Changeset and runs `pnpm version-packages` to update the independent repack version and changelog
  3. Builds the repack, preserving its version and recording the bundled `upstreamVersion`
  4. Runs the tests
  5. Commits directly to `main`
  6. Publishes the package and pushes its release tag
- If the commit succeeds but npm publishing fails, rerunning the workflow detects,
  rebuilds, tests, and publishes the pending version without another bump. This
  checks the exact repack version on npm, independently of upstream version numbers.
- Tag recovery runs even when there is no new upstream version. It verifies that
  the exact package version is published and uses the registry's `gitHead` commit
  to create a missing annotated tag. Before an upstream update advances the version,
  it recovers the current release's tag if that version is already published, so a
  failed tag push is retried before the next release. The new release is tagged
  after publication. Recovery stops if that metadata is missing,
  invalid, or unavailable in the checkout; restore the tag manually at the verified
  release commit in that case. Existing tags can be pushed again without registry
  commit metadata and are never moved. Run `pnpm release:tags` to retry locally.

## Repack fixes between upstream releases

Add a Changeset for the fix and run `pnpm version-packages`. Build and test the
versioned package, then commit and push the version and changelog changes. The
daily workflow or a manual dispatch publishes that version even when dayjs has
not changed. To publish locally after committing, run `pnpm release` followed by
`pnpm release:tags`.

The next upstream update advances from the current repack version. An upstream
patch, minor, or major update creates the corresponding Changeset bump, so a
manual repack release does not consume a future upstream release number. Any
pending Changesets are included in that versioning step.

## Required Secrets

| Secret | Used by |
|---|---|
| `GITHUB_TOKEN` | `check-updates.yml` (push commit and release tag) |
| `NPM_TOKEN` | `check-updates.yml` (npm publish) |

The repository must allow GitHub Actions to push directly to `main`.
