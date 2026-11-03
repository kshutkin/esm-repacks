# @esm-repacks/dayjs

## 1.11.24

### Patch Changes

- eb669f6: Remove the ambient locale wildcard so TypeScript rejects nonexistent and unexported locale imports, matching runtime package exports. Preserve standalone locale types and plugin augmentation.
- ad84f13: Add explicit JavaScript extensions to relative imports so core, plugins, and locales load in native Node.js ESM.
- 5b8c8b9: Document support for Bundler, Node16, and NodeNext TypeScript resolution, type-only instance exports, and conditional plugin augmentation.
- d2b14d8: Resolve locale declarations independently of core imports under bundler, node16, and nodenext module resolution.
- 74fd55d: Expose Dayjs instances as an augmentable type without advertising a nonexistent named constructor export. Preserve the constructor type passed to plugins.
- d4e554f: Include the complete upstream dayjs license and copyright notice in the published package.
- b346e22: Allow repack versions to advance independently of dayjs. Preserve Changesets versions during builds and record the bundled dayjs version in upstreamVersion metadata. Upstream updates receive their own semantic version bump.
- cf61e97: Recover missing release tags at the published gitHead commit instead of the current checkout. Refuse to guess when registry commit metadata is unavailable, while preserving retries for existing tags.

## 1.11.23

### Patch Changes

- 0732263: Update dayjs to 1.11.22

## 1.11.22

### Patch Changes

- dcef058: Update dayjs to 1.11.21
