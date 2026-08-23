# Automation Pipeline

The project uses one workflow to automatically detect, repack, version, and publish new upstream releases.

## Workflows

### `check-updates.yml` — Daily update and release

- Runs on a cron schedule (daily at 06:00 UTC) and on `workflow_dispatch`
- Compares the declared `dayjs` devDependency against `npm view dayjs version`
- When a new version is available, it:
  1. Updates the dependency
  2. Rebuilds the repack, sets its version to the upstream version, and updates its changelog
  3. Runs the tests
  4. Commits directly to `main`
  5. Publishes the package and pushes its release tag
- If the commit succeeds but npm publishing fails, rerunning the workflow detects,
  rebuilds, tests, and publishes the pending version without another bump

## Required Secrets

| Secret | Used by |
|---|---|
| `GITHUB_TOKEN` | `check-updates.yml` (push commit and release tag) |
| `NPM_TOKEN` | `check-updates.yml` (npm publish) |

The repository must allow GitHub Actions to push directly to `main`.
