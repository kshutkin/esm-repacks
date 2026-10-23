# Project Architecture

## What This Is

**esm-repacks** is a monorepo of thin redistribution packages that add proper `"exports"` maps to popular libraries that ship ESM files but omit them from `package.json` `"exports"`. No library logic is modified — only the exports map and type declarations are layered on top.

## Repository Layout

```
packages/
  dayjs/           — @esm-repacks/dayjs (published)
  test-dayjs/      — TypeScript type-check integration test (private)
  test-lodash-treeshake/  — tree-shaking integration test (private)
scripts/
  release.mjs      — publishes packages via Changesets
  dayjs-changeset.mjs — records the semantic bump for an upstream update
  release-tags.mjs — verifies publication and pushes the release tag
.changeset/        — changeset files for versioning
.github/workflows/ — CI/CD automation
```

## Package Convention

Each repack package:
- Lives under `packages/<name>/`
- Has a `scripts/repack.mjs` that builds `dist/` from the installed upstream devDependency
- Uses an independent Changesets version and records the bundled upstream version in `upstreamVersion` metadata
- Uses `pkgprn --flatten dist` in `prepack` to flatten `dist/` as the publish root
- Exports only via the `"exports"` map — no `"main"` or `"module"` fields needed

## Versioning & Publishing

- Changesets owns repack versions and changelogs; builds preserve both
- Upstream patch, minor, and major updates produce the corresponding Changeset bump relative to the current repack version
- The daily workflow commits a tested repack directly to `main`
- Uses [Changesets](https://github.com/changesets/changesets) to publish the package and create its release tag

## Tech Stack

- **Package manager**: pnpm (workspace)
- **Test runner**: vitest
- **Type transform**: ts-morph (in `packages/dayjs/scripts/repack.mjs`)
- **Node.js version**: 24 (in CI)
