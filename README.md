# esm-repacks

Proper ESM repacks of popular libraries with subpath exports.

## Packages

### [@esm-repacks/dayjs](packages/dayjs)

A proper ESM repack of [dayjs](https://day.js.org/) with subpath exports for all plugins and locales.

```bash
npm install @esm-repacks/dayjs
```

```js
import dayjs from '@esm-repacks/dayjs';
import utc from '@esm-repacks/dayjs/plugin/utc';
import fr from '@esm-repacks/dayjs/locale/fr';

dayjs.extend(utc);
dayjs.locale('fr');
```

### Why?

dayjs ships ESM files but does not expose them via `exports` in `package.json`. This means bundlers and Node.js ESM resolution cannot find the ESM entry points without using deep import paths like `dayjs/esm`. This repack fixes that by providing a proper `exports` map with all 37 plugins and 143 locales as subpath exports.

### Automation

- A daily cron job checks for new dayjs releases on npm
- When a new version is detected, an automated workflow builds, tests, and creates a PR
- On merge, changesets handles versioning and publishing to npm