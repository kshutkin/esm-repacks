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
