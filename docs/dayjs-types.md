# dayjs ESM Type Declarations

The build transforms upstream declarations into ESM declarations using `ts-morph`
in `packages/dayjs/scripts/repack.mjs`. Core, plugin, and locale imports support
TypeScript's `bundler`, `node16`, and `nodenext` module resolution modes.

The [original design plan](../packages/dayjs/PLAN-ESM-TYPES.md) records the design
process; this document describes the implemented behavior.

## Core declarations

`dist/index.d.ts` exports a default callable `dayjs` value described by the
`DayjsStatic` interface. Types such as `Dayjs`, `ConfigType`, and `PluginFunc` are
named exports:

```ts
import dayjs from '@esm-repacks/dayjs';
import type { Dayjs, PluginFunc } from '@esm-repacks/dayjs';

const date: Dayjs = dayjs('2023-06-15');
const plugin: PluginFunc = (_option, Constructor, factory) => {
  Constructor.prototype.format;
  factory.isDayjs(date);
};
dayjs.extend(plugin);
```

`Dayjs` is an augmentable instance interface, with no named runtime constructor
export. `PluginFunc` describes the constructor passed to plugins with a separate
constructor interface. The upstream namespace's static functions and properties
become members of `DayjsStatic`; `dayjs.extend()` returns that callable interface.

## Plugin declarations

Each plugin declaration uses `export default plugin` and augments
`@esm-repacks/dayjs`:

- Instance methods merge into the exported `Dayjs` interface.
- Static functions and properties merge into `DayjsStatic`.
- Other upstream interfaces and types are preserved, including `ConfigTypeMap`
  extensions and the duration plugin's type namespace.

Augmentation applies when a plugin is imported. Plugins that are not imported do
not contribute their methods. Call `dayjs.extend(plugin)` to install the plugin at
runtime; importing its declaration does not perform registration.

## Locale declarations

Each exported locale points to `dist/locale/locale.d.ts`, which references the
shared `ILocale` declaration in `dist/locale/types.d.ts`. Core references that same
shared declaration directly, so locale imports also type-check without core.

The upstream ambient `locale/*` declaration is omitted. TypeScript follows the
explicit exports map and rejects nonexistent or unexported locale paths.

## Validation

Run from the repository root:

```sh
pnpm -C packages/dayjs run build
pnpm -C packages/dayjs run test
pnpm -C packages/test-dayjs run typecheck
pnpm -C packages/test-dayjs run typecheck:node16
```

Packed-consumer tests cover native Node.js imports, constructor and plugin
augmentation types, and valid and invalid locale imports under Bundler, Node16,
and NodeNext resolution. The integration fixture checks core, UTC, duration, and
timezone APIs, plus absent plugin methods, under Bundler and Node16 resolution.
