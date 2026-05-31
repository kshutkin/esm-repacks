# dayjs ESM Type Declarations

> Full implementation plan: [packages/dayjs/PLAN-ESM-TYPES.md](../packages/dayjs/PLAN-ESM-TYPES.md)

## Problem

`@esm-repacks/dayjs` currently works only with `"moduleResolution": "bundler"`. Under `"node16"` / `"nodenext"`, TypeScript enforces strict ESM semantics:

- `export = dayjs` (CJS-compatible form) is not compatible with `import dayjs from '...'`
- Results in `TS1192: Module has no default export`

This is independent of the `"exports"` map resolution — the modules are *found* correctly, they just can't be consumed as ESM default imports.

## Solution (planned)

Transform `.d.ts` files at build time (inside `scripts/repack.mjs`) using **ts-morph**:

### `dist/index.d.ts`
- Remove `export = dayjs`
- Flatten `declare namespace dayjs { ... }` to module-level exports
- Replace static function/value exports with a new `export interface DayjsStatic { }` that plugins can augment via interface merging
- Add `declare const dayjs: DayjsStatic; export default dayjs`

### `dist/plugin/*/index.d.ts`
- `export = plugin` → `export default plugin`
- `export function/const` inside `declare module` → `interface DayjsStatic { }` entries (interface merging instead of namespace mutation)
- Remove `export as namespace` (UMD artifact, not needed for ESM)

## Key Design Decision: `DayjsStatic` interface

Using a named exported `interface DayjsStatic` (rather than a namespace or ambient `declare module` block per plugin) keeps augmentation **conditional**: a plugin's static methods only appear on the type when that plugin is actually imported. This correctly mirrors runtime behaviour.

The single-file ambient bundle approach (dts-buddy style) was rejected because it makes all plugin augmentations unconditionally active, regardless of which plugins you've actually called `dayjs.extend()` on.

## Status

Planned. `ts-morph` is already a devDependency in `packages/dayjs`. The transform rules are fully specified in the plan doc linked above, including a pattern inventory for all 37 plugins.
