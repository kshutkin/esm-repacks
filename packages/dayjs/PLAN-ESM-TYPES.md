# Plan: Transform dayjs Type Declarations to `export default`

## Goal

Make `@esm-repacks/dayjs` work with `"moduleResolution": "node16"` and `"nodenext"` in addition
to `"bundler"`.

Currently the package only works with `"moduleResolution": "bundler"` because:

1. `node16`/`nodenext` **do** correctly read the `package.json` `"exports"` map and discover
   subpath declarations — the module resolution itself is fine.
2. But they enforce strict ESM semantics: `import x from 'y'` requires a real `export default`,
   not `export = x` (a CJS-compatible declaration form). This causes
   `TS1192: Module has no default export`.

The fix is to transform the copied `.d.ts` files as part of the existing repack script so they
use `export default` and a flat module structure, while preserving plugin module augmentation.

---

## Key Insight: Why the Flat Structure Is Required and How to Handle Statics

With `export =`, the module scope IS the `dayjs` namespace. Module augmentation in plugins
(`declare module '@esm-repacks/dayjs' { interface Dayjs { ... } }`) adds directly into that
namespace, which is why it works.

With `export default`, the `dayjs` namespace is no longer the module scope. Two separate problems
arise:

**Problem 1 — instance methods stop merging.**  
`interface Dayjs` augmentation only works if `Dayjs` is declared at module scope, not nested
inside `declare namespace dayjs`. Solution: move `class Dayjs` and all types out of the
namespace to module level.

**Problem 2 — static methods stop merging.**  
With `export =`, `declare module 'pkg' { export function utc(...) }` adds `utc` to the dayjs
namespace because the module IS the namespace. With `export default` this no longer holds.

The naive fix — keeping a `declare namespace dayjs { }` block and adding `export { dayjs }` to
give the namespace something to merge with — works technically but is a lie: there is no named
`dayjs` export in the actual JS, only `export default`.

**The correct fix: replace the namespace with an exported `DayjsStatic` interface.**

Instead of a `declare namespace dayjs` block for static methods, define an exported
`interface DayjsStatic` that describes the callable function and all its static methods.
Plugins augment `interface DayjsStatic` in their `declare module` block via standard interface
merging. No named value export needed.

```ts
// index.d.ts
export interface DayjsStatic {
    (date?: ConfigType): Dayjs;
    extend<T = unknown>(plugin: PluginFunc<T>, option?: T): DayjsStatic;
    isDayjs(d: any): d is Dayjs;
    unix(t: number): Dayjs;
    // statics added by plugins via interface merging
}

declare const dayjs: DayjsStatic;
export default dayjs; // the ONLY value export — no lie
```

```ts
// plugin/utc.d.ts
declare module "@esm-repacks/dayjs" {
    interface Dayjs {
        // instance method augmentation
        utc(keepLocalTime?: boolean): Dayjs;
    }
    interface DayjsStatic {
        // static method augmentation
        utc(config?: ConfigType): Dayjs;
    }
}
```

This was verified experimentally. With this structure, under `"moduleResolution": "node16"`:

- `d.utc()` is typed correctly after importing the utc plugin ✓
- `dayjs.utc(...)` is typed correctly after importing the utc plugin ✓
- both are absent (with `@ts-expect-error` confirmed) when the plugin is not imported ✓
- `"moduleResolution": "bundler"` continues to work identically ✓

---

## Transform Rules

### 1. `dist/index.d.ts`

#### Before (dayjs's shape after module-name rewriting)

```ts
/// <reference path="./locale/index.d.ts" />

export = dayjs;

declare function dayjs(date?: dayjs.ConfigType): dayjs.Dayjs
declare function dayjs(date?: dayjs.ConfigType, format?: dayjs.OptionType, strict?: boolean): dayjs.Dayjs
declare function dayjs(date?: dayjs.ConfigType, format?: dayjs.OptionType, locale?: string, strict?: boolean): dayjs.Dayjs

declare namespace dayjs {
  interface ConfigTypeMap { ... }
  export type ConfigType = ConfigTypeMap[keyof ConfigTypeMap]
  export interface FormatObject { ... }
  export type OptionType = ...
  export type UnitTypeShort = ...
  export type UnitTypeLong = ...
  export type UnitTypeLongPlural = ...
  export type UnitType = ...
  export type OpUnitType = ...
  export type QUnitType = ...
  export type ManipulateType = ...
  class Dayjs {
    clone(): Dayjs
    isValid(): boolean
    // ... all instance methods
  }
  interface Dayjs {}
  export type PluginFunc<T = unknown> = (option: T, c: typeof Dayjs, d: typeof dayjs) => void
  export function extend<T = unknown>(plugin: PluginFunc<T>, option?: T): Dayjs
  export function locale(preset?: string | ILocale, object?: Partial<ILocale>, isLocal?: boolean): string
  export function isDayjs(d: any): d is Dayjs
  export function unix(t: number): Dayjs
  const Ls: { [key: string]: ILocale }
}
```

#### After

```ts
/// <reference path="./locale/index.d.ts" />

export interface ConfigTypeMap {
    default: string | number | Date | Dayjs | null | undefined;
}
export type ConfigType = ConfigTypeMap[keyof ConfigTypeMap];
export interface FormatObject {
    locale?: string;
    format?: string;
    utc?: boolean;
}
export type OptionType = FormatObject | string | string[];
export type UnitTypeShort = "d" | "D" | "M" | "y" | "h" | "m" | "s" | "ms";
export type UnitTypeLong =
    | "millisecond"
    | "second"
    | "minute"
    | "hour"
    | "day"
    | "month"
    | "year"
    | "date";
export type UnitTypeLongPlural =
    | "milliseconds"
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "months"
    | "years"
    | "dates";
export type UnitType = UnitTypeLong | UnitTypeLongPlural | UnitTypeShort;
export type OpUnitType = UnitType | "week" | "weeks" | "w";
export type QUnitType = UnitType | "quarter" | "quarters" | "Q";
export type ManipulateType = Exclude<OpUnitType, "date" | "dates">;
export type PluginFunc<T = unknown> = (
    option: T,
    c: typeof Dayjs,
    d: DayjsStatic,
) => void;

export declare class Dayjs {
    constructor(config?: ConfigType);
    clone(): Dayjs;
    isValid(): boolean;
    // ... all instance methods, unchanged
}
export interface Dayjs {}

// Exported interface describing the callable + statics.
// Plugins augment this via interface merging in their declare module blocks.
export interface DayjsStatic {
    (date?: ConfigType): Dayjs;
    (date?: ConfigType, format?: OptionType, strict?: boolean): Dayjs;
    (
        date?: ConfigType,
        format?: OptionType,
        locale?: string,
        strict?: boolean,
    ): Dayjs;
    extend<T = unknown>(plugin: PluginFunc<T>, option?: T): DayjsStatic;
    locale(
        preset?: string | ILocale,
        object?: Partial<ILocale>,
        isLocal?: boolean,
    ): string;
    isDayjs(d: any): d is Dayjs;
    unix(t: number): Dayjs;
    readonly Ls: { [key: string]: ILocale };
}

declare const dayjs: DayjsStatic;
export default dayjs;
```

#### Step-by-step rules

| Step | Rule                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Remove the `export = dayjs;` line                                                                                                                                                                            |
| 2    | Remove the `declare function dayjs(...)` overloads — they move into `DayjsStatic` as call signatures                                                                                                         |
| 3    | Remove the `declare namespace dayjs {` opening and its matching closing `}`                                                                                                                                  |
| 4    | Items that were inside the namespace and are **types / interfaces / class**: move to module level, ensure they carry an `export` keyword                                                                     |
| 5    | Items that were inside the namespace and are **functions or values** (`extend`, `locale`, `isDayjs`, `unix`, `Ls`): move into a new `export interface DayjsStatic { }` block as method / property signatures |
| 6    | Also move the original `declare function dayjs(...)` call signatures into `DayjsStatic`                                                                                                                      |
| 7    | Update `PluginFunc`: the third parameter changes from `d: typeof dayjs` to `d: DayjsStatic`                                                                                                                  |
| 8    | Add `declare const dayjs: DayjsStatic` and `export default dayjs` at the end                                                                                                                                 |

**Rule 4 vs Rule 5 discriminator:** Is it a `function`, `const`, `let`, or `var` declaration?
→ Yes: goes to `DayjsStatic`.
→ No (type alias, interface, class): goes to module level.

---

### 2. `dist/plugin/*/index.d.ts`

Every plugin file follows one or more of these patterns. The transforms are independent and
can be applied in sequence.

#### Pattern A — `export = plugin` → `export default plugin`

All plugins have this. Simple line replacement.

```ts
// Before
export = plugin;

// After
export default plugin;
```

#### Pattern B — Remove `export as namespace plugin`

Present only in `duration`. Remove the line entirely (UMD compatibility, not needed for ESM).

#### Pattern C — `declare namespace plugin { ... }` — leave unchanged

Present in `duration`. The plugin's own namespace (containing `Duration`, `CreateDurationType`,
etc.) is a local declaration used for type references within the same file. It is not affected
by any other transform.

#### Pattern D — `interface Dayjs { ... }` inside `declare module` — leave unchanged

Instance method augmentation. Already targets the module-level `Dayjs` correctly in the new
structure.

```ts
// Before and after — identical
declare module "@esm-repacks/dayjs" {
    interface Dayjs {
        utc(keepLocalTime?: boolean): Dayjs;
    }
}
```

#### Pattern E — `interface XxxYyy { ... }` (non-Dayjs) inside `declare module` — leave unchanged

New types added to the module by a plugin (e.g. `InstanceLocaleDataReturn`,
`GlobalLocaleDataReturn` in `localeData`, `DayjsTimezone` in `timezone`). Already module-level.
No change needed.

#### Pattern F — `interface ConfigTypeMap { ... }` inside `declare module` — leave unchanged

Augments the `ConfigTypeMap` interface. In the new flat structure `ConfigTypeMap` is a
module-level export, so augmentation targeting it works correctly without change.

#### Pattern G — `export function xxx(...)` inside `declare module` → `interface DayjsStatic`

Static methods added to the `dayjs` object. Must move into an `interface DayjsStatic` block so
they merge with the exported `DayjsStatic` interface.

```ts
// Before
declare module "@esm-repacks/dayjs" {
    export function utc(
        config?: ConfigType,
        format?: string,
        strict?: boolean,
    ): Dayjs;
    export function weekdays(localOrder?: boolean): WeekdayNames;
}

// After
declare module "@esm-repacks/dayjs" {
    interface DayjsStatic {
        utc(config?: ConfigType, format?: string, strict?: boolean): Dayjs;
        weekdays(localOrder?: boolean): WeekdayNames;
    }
}
```

All `export function` declarations within a single `declare module` block should be collected
into one `interface DayjsStatic { }` block.

#### Pattern H — `export const xxx` / `export let xxx` inside `declare module` → `interface DayjsStatic`

Same rule as Pattern G, applied to value exports.

```ts
// Before
declare module "@esm-repacks/dayjs" {
    export const duration: plugin.CreateDurationType;
    export function isDuration(d: any): d is plugin.Duration;
}

// After
declare module "@esm-repacks/dayjs" {
    interface DayjsStatic {
        readonly duration: plugin.CreateDurationType;
        isDuration(d: any): d is plugin.Duration;
    }
}
```

Note: `export const` becomes a `readonly` property signature in the interface.

#### Pattern I — `const xxx` (without `export`) inside `declare module` → `interface DayjsStatic`

Present in `timezone`: `const tz: DayjsTimezone` has no `export` keyword. In the `export =`
world this still ended up on the `dayjs` namespace because the module scope was the namespace.
In the new structure it must be moved explicitly into `interface DayjsStatic`.

```ts
// Before
declare module "@esm-repacks/dayjs" {
    interface DayjsTimezone {
        (date?: ConfigType, timezone?: string): Dayjs;
        guess(): string;
        setDefault(timezone?: string): void;
    }
    const tz: DayjsTimezone;
}

// After
declare module "@esm-repacks/dayjs" {
    interface DayjsTimezone {
        (date?: ConfigType, timezone?: string): Dayjs;
        guess(): string;
        setDefault(timezone?: string): void;
    }
    interface DayjsStatic {
        readonly tz: DayjsTimezone;
    }
}
```

**Discriminator for Patterns G / H / I:** any `function`, `const`, or `let` declaration inside
`declare module` (with or without `export`) becomes a method or `readonly` property in
`interface DayjsStatic`. Everything else stays.

---

## Pattern Inventory Across All 37 Plugins

Columns: **D** = `interface Dayjs`, **E** = non-Dayjs interface, **F** = `interface ConfigTypeMap`,
**G** = `export function`, **H** = `export const/let`, **I** = unexported `const/let`.

| Plugin             |  D  |  E  |  F  |  G  |  H  |  I  | Notes                                                                                 |
| ------------------ | :-: | :-: | :-: | :-: | :-: | :-: | ------------------------------------------------------------------------------------- |
| advancedFormat     |  —  |  —  |  —  |  —  |  —  |  —  | no `declare module` block at all                                                      |
| arraySupport       |  ✓  |  —  |  ✓  |  —  |  —  |  —  |                                                                                       |
| badMutable         |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| bigIntSupport      |  —  |  —  |  ✓  |  —  |  —  |  —  |                                                                                       |
| buddhistEra        |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| calendar           |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| customParseFormat  |  —  |  —  |  —  |  —  |  —  |  —  | no `declare module` block at all                                                      |
| dayOfYear          |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| devHelper          |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| duration           |  ✓  |  —  |  —  |  —  |  ✓  |  —  | also has `declare namespace plugin` (Pattern C) and `export as namespace` (Pattern B) |
| isBetween          |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isLeapYear         |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isMoment           |  —  |  —  |  —  |  ✓  |  —  |  —  |                                                                                       |
| isSameOrAfter      |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isSameOrBefore     |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isToday            |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isTomorrow         |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isYesterday        |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isoWeek            |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| isoWeeksInYear     |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| localeData         |  ✓  |  ✓  |  —  |  ✓  |  —  |  —  | non-Dayjs interfaces: `InstanceLocaleDataReturn`, `GlobalLocaleDataReturn`            |
| localizedFormat    |  —  |  —  |  —  |  —  |  —  |  —  | no `declare module` block at all                                                      |
| minMax             |  —  |  —  |  —  |  ✓  |  —  |  —  | only static functions, no `interface Dayjs`                                           |
| negativeYear       |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| objectSupport      |  ✓  |  —  |  ✓  |  —  |  —  |  —  |                                                                                       |
| pluralGetSet       |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| preParsePostFormat |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| quarterOfYear      |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| relativeTime       |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| timezone           |  ✓  |  ✓  |  —  |  —  |  —  |  ✓  | non-Dayjs interface: `DayjsTimezone`; unexported `const tz: DayjsTimezone`            |
| toArray            |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| toObject           |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| updateLocale       |  —  |  —  |  —  |  ✓  |  —  |  —  |                                                                                       |
| utc                |  ✓  |  —  |  —  |  ✓  |  —  |  —  |                                                                                       |
| weekOfYear         |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| weekYear           |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |
| weekday            |  ✓  |  —  |  —  |  —  |  —  |  —  |                                                                                       |

All patterns present are covered by rules D–I above. No plugin introduces a pattern outside
this set.

---

## Implementation

The transform should be added to `scripts/repack.mjs` as a new `transformDts(content, kind)`
function called from the existing `copyAndTransformDts` pipeline.

### Recommended approach: light structural parser, not regex

The transforms require understanding syntactic block boundaries (matching `{` / `}`). A pure
line-by-line regex approach will break on multi-line generics, overloaded signatures, and
nested braces. Recommended: use the TypeScript compiler API or `ts-morph` to parse and
rewrite the AST.

If keeping the script dependency-free is preferred, a simple brace-counting state machine
is sufficient given the constrained structure of these files.

### `kind` values

- `"index"` — apply the `index.d.ts` transform (Rules 1–8)
- `"plugin"` — apply the plugin transform (Patterns A–I)
- `"locale"` — no structural transform needed (locale files have no type declarations)

### New devDependency

```
ts-morph  (or typescript, already a transitive dep)
```

---

## Validation

After implementing the transform, update `packages/test-dayjs` to also run `tsc` with
`"moduleResolution": "node16"` and `"module": "node16"` to confirm:

1. Subpath imports resolve correctly (no `TS2307`).
2. `import dayjs from '@esm-repacks/dayjs'` works (no `TS1192`).
3. Instance method augmentation works after plugin import (`d.utc()` typed correctly).
4. Static method augmentation works after plugin import (`dayjs.utc(...)` typed correctly).
5. A plugin that is **not** imported does **not** contribute its methods to `Dayjs` or
   `DayjsStatic` (conditional augmentation is preserved).
6. Existing `"moduleResolution": "bundler"` tests continue to pass.

---

## What Does Not Change

- The JS files (`dist/**/*.js`) are not touched. This is a purely a `.d.ts` transform.
- The `package.json` `"exports"` map structure is unchanged.
- The locale `.d.ts` files (`dist/locale/index.d.ts`, `dist/locale/types.d.ts`) are unchanged.
- Plugin runtime behaviour is unchanged.
- The repack script's version-sync and exports-map generation logic is unchanged.
