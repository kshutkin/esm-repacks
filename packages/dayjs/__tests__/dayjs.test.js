import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

describe('dayjs core', () => {
  it('should import and create a date object', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const d = dayjs();
    expect(d).toBeDefined();
    expect(d.isValid()).toBe(true);
  });

  it('should format dates', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const d = dayjs('2023-01-15');
    expect(d.format('YYYY-MM-DD')).toBe('2023-01-15');
    expect(d.format('YYYY')).toBe('2023');
    expect(d.format('MM')).toBe('01');
    expect(d.format('DD')).toBe('15');
  });

  it('should parse and manipulate dates', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const d = dayjs('2023-06-15');
    expect(d.add(1, 'day').format('YYYY-MM-DD')).toBe('2023-06-16');
    expect(d.subtract(1, 'month').format('YYYY-MM-DD')).toBe('2023-05-15');
    expect(d.year()).toBe(2023);
    expect(d.month()).toBe(5); // 0-indexed
    expect(d.date()).toBe(15);
  });
});

describe('plugins', () => {
  it('should import and use utc plugin', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const { default: utc } = await import('@esm-repacks/dayjs/plugin/utc');
    dayjs.extend(utc);
    const d = dayjs.utc('2023-06-15T12:00:00Z');
    expect(d.isUTC()).toBe(true);
    expect(d.format('YYYY-MM-DD HH:mm:ss')).toBe('2023-06-15 12:00:00');
  });

  it('should import and use customParseFormat plugin', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const { default: customParseFormat } = await import('@esm-repacks/dayjs/plugin/customParseFormat');
    dayjs.extend(customParseFormat);
    const d = dayjs('15/06/2023', 'DD/MM/YYYY');
    expect(d.isValid()).toBe(true);
    expect(d.format('YYYY-MM-DD')).toBe('2023-06-15');
  });

  it('should import and use relativeTime plugin', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const { default: relativeTime } = await import('@esm-repacks/dayjs/plugin/relativeTime');
    dayjs.extend(relativeTime);
    const past = dayjs().subtract(3, 'hour');
    const result = past.fromNow();
    expect(result).toContain('hours ago');
  });

  it('should import and use duration plugin', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const { default: duration } = await import('@esm-repacks/dayjs/plugin/duration');
    dayjs.extend(duration);
    const d = dayjs.duration(72, 'hours');
    expect(d.asDays()).toBe(3);
    expect(d.asHours()).toBe(72);
  });
});

describe('locales', () => {
  it('should import and use french locale', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    await import('@esm-repacks/dayjs/locale/fr');
    const d = dayjs('2023-06-15').locale('fr');
    expect(d.format('dddd')).toBe('jeudi');
    expect(d.format('MMMM')).toBe('juin');
  });

  it('should import and use german locale', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    await import('@esm-repacks/dayjs/locale/de');
    const d = dayjs('2023-06-15').locale('de');
    expect(d.format('dddd')).toBe('Donnerstag');
  });

  it('should import and use japanese locale', async () => {
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    await import('@esm-repacks/dayjs/locale/ja');
    const d = dayjs('2023-06-15').locale('ja');
    expect(d.format('dddd')).toBe('木曜日');
  });
});

describe('type declarations', () => {
  it('should have main index.d.ts', () => {
    expect(existsSync(resolve(distDir, 'index.d.ts'))).toBe(true);
  });

  it('should have plugin .d.ts files', () => {
    expect(existsSync(resolve(distDir, 'plugin', 'utc', 'index.d.ts'))).toBe(true);
    expect(existsSync(resolve(distDir, 'plugin', 'timezone', 'index.d.ts'))).toBe(true);
    expect(existsSync(resolve(distDir, 'plugin', 'relativeTime', 'index.d.ts'))).toBe(true);
    expect(existsSync(resolve(distDir, 'plugin', 'customParseFormat', 'index.d.ts'))).toBe(true);
  });

  it('should have locale type declarations', () => {
    expect(existsSync(resolve(distDir, 'locale', 'index.d.ts'))).toBe(true);
    expect(existsSync(resolve(distDir, 'locale', 'types.d.ts'))).toBe(true);
  });

  it('should have rewritten module declarations in .d.ts files', async () => {
    const { readFileSync } = await import('node:fs');
    const utcDts = readFileSync(resolve(distDir, 'plugin', 'utc', 'index.d.ts'), 'utf8');
    expect(utcDts).toContain("@esm-repacks/dayjs");
    expect(utcDts).not.toContain("from 'dayjs'");
    expect(utcDts).not.toContain("module 'dayjs'");
    expect(utcDts).not.toContain("dayjs/esm");
  });

  it('should have rewritten main index.d.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).not.toContain("dayjs/esm");
  });

  it('should use export default instead of export = in index.d.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).toContain('export default dayjs');
    expect(indexDts).not.toContain('export = dayjs');
  });

  it('should have DayjsStatic interface in index.d.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).toContain('export interface DayjsStatic {');
    expect(indexDts).toContain('declare const dayjs: DayjsStatic');
  });

  it('should have export interface Dayjs {} merge point in index.d.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).toContain('export interface Dayjs {}');
  });

  it('should not have declare namespace dayjs in index.d.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).not.toContain('declare namespace dayjs');
  });

  it('should use DayjsStatic in PluginFunc instead of typeof dayjs', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).toMatch(/PluginFunc.*DayjsStatic/);
    expect(indexDts).not.toContain('typeof dayjs');
  });

  it('should have call signatures in DayjsStatic', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    // Extract DayjsStatic block
    const match = indexDts.match(/export interface DayjsStatic \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const staticBlock = match[0];
    expect(staticBlock).toContain('(date?: ConfigType): Dayjs');
    expect(staticBlock).toContain('extend');
    expect(staticBlock).toContain('locale');
    expect(staticBlock).toContain('isDayjs');
    expect(staticBlock).toContain('unix');
    expect(staticBlock).toContain('readonly Ls');
  });

  it('should use export default plugin in plugin .d.ts files', async () => {
    const { readFileSync } = await import('node:fs');
    const plugins = ['utc', 'duration', 'timezone', 'relativeTime', 'advancedFormat', 'isBetween'];
    for (const name of plugins) {
      const dts = readFileSync(resolve(distDir, 'plugin', name, 'index.d.ts'), 'utf8');
      expect(dts).toContain('export default plugin');
      expect(dts).not.toContain('export = plugin');
    }
  });

  it('should not have export as namespace in duration plugin', async () => {
    const { readFileSync } = await import('node:fs');
    const dts = readFileSync(resolve(distDir, 'plugin', 'duration', 'index.d.ts'), 'utf8');
    expect(dts).not.toContain('export as namespace');
  });

  it('should move export function to DayjsStatic in plugin .d.ts (Pattern G)', async () => {
    const { readFileSync } = await import('node:fs');
    const utcDts = readFileSync(resolve(distDir, 'plugin', 'utc', 'index.d.ts'), 'utf8');
    expect(utcDts).toContain('interface DayjsStatic');
    expect(utcDts).not.toMatch(/export\s+function\s+utc/);
    // utc should be a method in DayjsStatic
    const match = utcDts.match(/interface DayjsStatic \{[\s\S]*?\n\s*\}/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain('utc(');
  });

  it('should move export const to readonly in DayjsStatic in plugin .d.ts (Pattern H)', async () => {
    const { readFileSync } = await import('node:fs');
    const durationDts = readFileSync(resolve(distDir, 'plugin', 'duration', 'index.d.ts'), 'utf8');
    expect(durationDts).toContain('interface DayjsStatic');
    expect(durationDts).not.toMatch(/export\s+const\s+duration/);
    const match = durationDts.match(/interface DayjsStatic \{[\s\S]*?\n\s*\}/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain('readonly duration');
  });

  it('should move unexported const to readonly in DayjsStatic in plugin .d.ts (Pattern I)', async () => {
    const { readFileSync } = await import('node:fs');
    const tzDts = readFileSync(resolve(distDir, 'plugin', 'timezone', 'index.d.ts'), 'utf8');
    expect(tzDts).toContain('interface DayjsStatic');
    // tz should be a readonly property in DayjsStatic, not a bare const
    expect(tzDts).not.toMatch(/^\s*const tz/m);
    const match = tzDts.match(/interface DayjsStatic \{[\s\S]*?\n\s*\}/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain('readonly tz: DayjsTimezone');
  });

  it('should preserve interface Dayjs augmentation in plugins (Pattern D)', async () => {
    const { readFileSync } = await import('node:fs');
    const utcDts = readFileSync(resolve(distDir, 'plugin', 'utc', 'index.d.ts'), 'utf8');
    expect(utcDts).toContain('interface Dayjs {');
    // Instance methods should still be inside interface Dayjs
    const dayjsMatch = utcDts.match(/interface Dayjs \{[\s\S]*?\n\s*\}/);
    expect(dayjsMatch).not.toBeNull();
    expect(dayjsMatch[0]).toContain('utc(keepLocalTime');
    expect(dayjsMatch[0]).toContain('local()');
    expect(dayjsMatch[0]).toContain('isUTC()');
  });

  it('should preserve non-Dayjs interfaces in plugins (Pattern E)', async () => {
    const { readFileSync } = await import('node:fs');
    const tzDts = readFileSync(resolve(distDir, 'plugin', 'timezone', 'index.d.ts'), 'utf8');
    expect(tzDts).toContain('interface DayjsTimezone {');
    const localeDts = readFileSync(resolve(distDir, 'plugin', 'localeData', 'index.d.ts'), 'utf8');
    expect(localeDts).toContain('interface InstanceLocaleDataReturn {');
    expect(localeDts).toContain('interface GlobalLocaleDataReturn {');
  });

  it('should preserve ConfigTypeMap augmentation in plugins (Pattern F)', async () => {
    const { readFileSync } = await import('node:fs');
    const arraySupportDts = readFileSync(resolve(distDir, 'plugin', 'arraySupport', 'index.d.ts'), 'utf8');
    expect(arraySupportDts).toContain('interface ConfigTypeMap {');
  });

  it('should preserve declare namespace plugin in duration (Pattern C)', async () => {
    const { readFileSync } = await import('node:fs');
    const durationDts = readFileSync(resolve(distDir, 'plugin', 'duration', 'index.d.ts'), 'utf8');
    expect(durationDts).toContain('declare namespace plugin {');
    expect(durationDts).toContain('interface Duration {');
  });

  it('should export types at module level in index.d.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const indexDts = readFileSync(resolve(distDir, 'index.d.ts'), 'utf8');
    expect(indexDts).toContain('export type ConfigType');
    expect(indexDts).toContain('export interface ConfigTypeMap');
    expect(indexDts).toContain('export interface FormatObject');
    expect(indexDts).toContain('export type OptionType');
    expect(indexDts).toContain('export type UnitType');
    expect(indexDts).toContain('export type OpUnitType');
    expect(indexDts).toContain('export type QUnitType');
    expect(indexDts).toContain('export type ManipulateType');
    expect(indexDts).toContain('export type PluginFunc');
    expect(indexDts).toContain('export class Dayjs');
  });
});

describe('exports map', () => {
  it('should have correct exports in package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(resolve(distDir, '..', 'package.json'), 'utf8'));
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].import).toBe('./dist/index.js');
    expect(pkg.exports['.'].types).toBe('./dist/index.d.ts');
    expect(pkg.exports['./plugin/utc']).toBeDefined();
    expect(pkg.exports['./plugin/utc'].import).toBe('./dist/plugin/utc/index.js');
    expect(pkg.exports['./locale/en']).toBeDefined();
    expect(pkg.exports['./locale/en'].import).toBe('./dist/locale/en.js');
  });

  it('should have version matching dayjs', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(resolve(distDir, '..', 'package.json'), 'utf8'));
    const dayjsPkg = JSON.parse(readFileSync(resolve(distDir, '..', 'node_modules', 'dayjs', 'package.json'), 'utf8'));
    expect(pkg.version).toBe(dayjsPkg.version);
  });
});
