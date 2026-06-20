# Automation Pipeline

The project uses a three-workflow CI/CD pipeline to automatically detect, repack, and publish new upstream releases.

## Workflows

### 1. `check-updates.yml` — Daily version check

- Runs on a cron schedule (daily at 06:00 UTC) and on `workflow_dispatch`
- Compares `packages/dayjs/package.json` version against `npm view dayjs version`
- If different, triggers `repack.yml` with the new version as input

### 2. `repack.yml` — Build, test, and open PR

- Triggered manually or by `check-updates.yml`
- Accepts `dayjs_version` input (default: `latest`)
- Grants the job `contents: write` and `pull-requests: write` so its
  `GITHUB_TOKEN` can push the repack branch and open the pull request
- Steps:
  1. `pnpm -C packages/dayjs add -D dayjs@<version>` — updates the devDependency
  2. `pnpm -C packages/dayjs run build` — runs `scripts/repack.mjs` to rebuild `dist/`
  3. `pnpm -C packages/dayjs run test` — runs vitest
  4. Determines bump type: **minor** if the minor version changed, otherwise **patch**
  5. Writes a changeset file to `.changeset/update-dayjs-<version>.md`
  6. Opens a PR via `peter-evans/create-pull-request` on branch `repack/dayjs-<version>`

### 3. `release.yml` — Publish on merge to main

- Triggered by every push to `main`
- Runs `changesets/action` which either:
  - Opens / updates a "Version Packages" PR (when unmerged changesets exist), or
  - Publishes to npm using `NPM_TOKEN` (when the version PR is merged)

## Required Secrets

| Secret | Used by |
|---|---|
| `GITHUB_TOKEN` | `repack.yml` (create PR), `release.yml` (changesets) |
| `NPM_TOKEN` | `release.yml` (npm publish) |
