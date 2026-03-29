# @esm-repacks/dayjs

A proper ESM repack of [dayjs](https://day.js.org/) with a complete `package.json` `exports` map, exposing all plugins and locales as first-class subpath exports.

## Credits

All credit for the underlying library goes to the [dayjs](https://github.com/iamkun/dayjs) authors and contributors. This package is a thin redistribution layer — it does not modify any dayjs logic, only adds the missing `exports` map and ensures the published ESM files are discoverable by modern tooling.

- dayjs is licensed under the [MIT License](https://github.com/iamkun/dayjs/blob/dev/LICENSE)
- dayjs repository: https://github.com/iamkun/dayjs

## Why does this exist?

dayjs ships ESM files under `dayjs/esm/` but does not expose them via `"exports"` in its `package.json`. This means:

- Node.js ESM resolution cannot find them without deep path hacks
- Bundlers that respect the `"exports"` field cannot tree-shake correctly
- TypeScript subpath plugin imports like `dayjs/plugin/utc` resolve to CJS files instead of ESM

This package fixes all of the above by providing a proper `"exports"` map over the existing dayjs ESM output.

## Installation

```bash
npm install @esm-repacks/dayjs
```

```bash
pnpm add @esm-repacks/dayjs
```

```bash
yarn add @esm-repacks/dayjs
```

## Usage

### Core

```js
import dayjs from "@esm-repacks/dayjs";

const now = dayjs();
console.log(now.format("YYYY-MM-DD"));
```

### Plugins

```js
import dayjs from "@esm-repacks/dayjs";
import utc from "@esm-repacks/dayjs/plugin/utc";
import timezone from "@esm-repacks/dayjs/plugin/timezone";
import relativeTime from "@esm-repacks/dayjs/plugin/relativeTime";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

dayjs.utc("2024-01-01T12:00:00Z").tz("America/New_York").format();
dayjs("2024-01-01").fromNow();
```

All 37 official dayjs plugins are available under `@esm-repacks/dayjs/plugin/<name>`:

`advancedFormat` · `arraySupport` · `badMutable` · `bigIntSupport` · `buddhistEra` · `calendar` · `customParseFormat` · `dayOfYear` · `devHelper` · `duration` · `isBetween` · `isLeapYear` · `isMoment` · `isSameOrAfter` · `isSameOrBefore` · `isToday` · `isTomorrow` · `isYesterday` · `isoWeek` · `isoWeeksInYear` · `localeData` · `localizedFormat` · `minMax` · `negativeYear` · `objectSupport` · `pluralGetSet` · `preParsePostFormat` · `quarterOfYear` · `relativeTime` · `timezone` · `toArray` · `toObject` · `updateLocale` · `utc` · `weekOfYear` · `weekYear` · `weekday`

### Locales

```js
import dayjs from "@esm-repacks/dayjs";
import "@esm-repacks/dayjs/locale/fr";
import "@esm-repacks/dayjs/locale/de";
import "@esm-repacks/dayjs/locale/ja";

dayjs.locale("fr");
dayjs("2024-06-15").format("dddd"); // 'samedi'
```

All 143 official dayjs locales are available under `@esm-repacks/dayjs/locale/<code>`.

## TypeScript

Type declarations are included. Plugin types use TypeScript's [module augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation) — importing a plugin automatically extends the `Dayjs` interface with the methods that plugin provides.

```ts
import dayjs from "@esm-repacks/dayjs";
import utc from "@esm-repacks/dayjs/plugin/utc";

dayjs.extend(utc);

const d = dayjs();
d.utc(); // ✅ typed correctly after import
```

### ⚠️ TypeScript moduleResolution requirement

**Plugin type augmentation requires a modern `moduleResolution` setting.**

TypeScript must be configured with:

```json
{
    "compilerOptions": {
        "moduleResolution": "bundler"
    }
}
```

**`"node16"` and `"nodenext"` do not work** despite correctly reading the `"exports"` field. The failure is a separate, independent constraint: dayjs's type declarations use `export = dayjs` and `export = plugin` — a CJS-compatible declaration form. Under `"node16"`/`"nodenext"`, TypeScript enforces strict ESM semantics and does not allow ESM `import x from 'y'` syntax against an `export =` declaration:

```
error TS1192: Module '"...dayjs/dist/index"' has no default export.
error TS1192: Module '"...dayjs/dist/plugin/utc/index"' has no default export.
```

Note that these are `TS1192` errors, not `TS2307` — the modules are _found_ via the `"exports"` map, they simply cannot be consumed as ESM default imports under the strict rules `node16`/`nodenext` enforce.

`"moduleResolution": "bundler"` does not have this restriction: it understands the `"exports"` map and also treats `export =` as interoperable with ESM default imports via `esModuleInterop`, which is the correct behaviour for code processed by a bundler.

With the legacy `"moduleResolution": "node"` (the default for older configs), TypeScript ignores the `package.json` `"exports"` field entirely and cannot find the subpath declarations at all:

```
error TS2307: Cannot find module '@esm-repacks/dayjs/plugin/utc' or its
corresponding type declarations.
  There are types at '...dist/plugin/utc/index.d.ts', but this result
  could not be resolved under your current 'moduleResolution' setting.
  Consider updating to 'node16', 'nodenext', or 'bundler'.
```

This is not a bug in this package — it is a limitation of the classic TypeScript module resolver, which predates the `"exports"` field in `package.json`.

#### Why not use the dts-buddy single-file approach to work around this?

The alternative workaround — used by some packages — is to bundle all type declarations into one ambient file (e.g. `types/index.d.ts`) containing `declare module '@esm-repacks/dayjs/plugin/utc' { ... }` blocks and point every export at that single file. This makes TypeScript's legacy resolver happy because it never needs to follow `"exports"`.

However, for dayjs this trade-off is not acceptable:

- dayjs plugins use module augmentation to extend `Dayjs` with new methods
- in the single ambient file approach, **every plugin's augmentation becomes active unconditionally** as soon as the package is loaded, regardless of which plugins you actually imported and registered
- this means `d.utc()`, `d.quarter()`, `d.isBetween()` etc. would all appear as valid on every `Dayjs` instance even if you never called `dayjs.extend(...)` for them

With the `"exports"`-based approach and a modern `moduleResolution`, the augmentation is properly **conditional** — a plugin's types only merge into `Dayjs` when you actually import that plugin, which correctly reflects the runtime behaviour.

If you are using a bundler such as Vite, esbuild, webpack 5, or Rollup, your TypeScript config almost certainly already uses `"moduleResolution": "bundler"`, so this will work out of the box.

## Versioning

This package mirrors the dayjs version exactly. `@esm-repacks/dayjs@1.11.13` wraps `dayjs@1.11.13`. A daily automated workflow checks for new dayjs releases and publishes updated repacks.

## License

MIT — see [LICENSE](./LICENSE).

The repackaged dayjs source is also MIT — see the [dayjs license](https://github.com/iamkun/dayjs/blob/dev/LICENSE).
