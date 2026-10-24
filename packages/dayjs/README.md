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

Type declarations are included. Importing a plugin adds its type augmentation to
`Dayjs` and the `dayjs` factory. Call `dayjs.extend(plugin)` to install the plugin
at runtime.

```ts
import dayjs from "@esm-repacks/dayjs";
import type { Dayjs } from "@esm-repacks/dayjs";
import utc from "@esm-repacks/dayjs/plugin/utc";

dayjs.extend(utc);

const d: Dayjs = dayjs();
d.utc();
```

`Dayjs` is a type-only export. Plugins that are not imported do not contribute
their instance or static methods to the types.

### TypeScript module resolution

Core, plugins, and locales support these resolver settings:

| Use | `module` | `moduleResolution` |
|---|---|---|
| Bundler | `ESNext` | `bundler` |
| Node.js | `Node16` | `node16` |
| Node.js | `NodeNext` | `nodenext` |

For native Node.js ESM, for example:

```json
{
    "compilerOptions": {
        "module": "NodeNext",
        "moduleResolution": "nodenext"
    }
}
```

Set `"type": "module"` in your application's `package.json`, or use `.mts` source
files, so TypeScript treats your Node.js code as ESM.

The legacy `"moduleResolution": "node"` resolver does not support the package's
subpath exports. Use one of the settings above. Locale declarations resolve only
for exported locales; standalone locale imports also work without importing core.

## Versioning

This package uses independent semantic versions so repack fixes can ship between dayjs releases. The published `package.json` records the bundled dayjs version in `upstreamVersion`.

A daily automated workflow checks for new dayjs releases and publishes updated repacks. An upstream patch, minor, or major update applies the corresponding bump to the repack's current version. For example, a repack fix can release as `1.11.24` with dayjs `1.11.23`; the next upstream `1.11.24` then ships in repack `1.11.25`.

## License

MIT — see [LICENSE](./LICENSE).

The repackaged dayjs source is also MIT — see the [dayjs license](https://github.com/iamkun/dayjs/blob/dev/LICENSE).
