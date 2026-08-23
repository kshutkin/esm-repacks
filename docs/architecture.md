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
  release.mjs      — publishes packages via changesets
.changeset/        — changeset files for versioning
.github/workflows/ — CI/CD automation
```

## Package Convention

Each repack package:
- Lives under `packages/<name>/`
- Has a `scripts/repack.mjs` that downloads the upstream package from npm and builds `dist/`
- Mirrors the upstream version exactly (e.g. `@esm-repacks/dayjs@1.11.13` wraps `dayjs@1.11.13`)
- Uses `pkgprn --flatten dist` in `prepack` to flatten `dist/` as the publish root
- Exports only via the `"exports"` map — no `"main"` or `"module"` fields needed

## Versioning & Publishing

- The repack build mirrors the upstream version and updates the changelog
- The daily workflow commits a tested repack directly to `main`
- Uses [Changesets](https://github.com/changesets/changesets) to publish the package and create its release tag

## Tech Stack

- **Package manager**: pnpm (workspace)
- **Test runner**: vitest
- **Type transform**: ts-morph (in `packages/dayjs/scripts/repack.mjs`)
- **Node.js version**: 24 (in CI)
