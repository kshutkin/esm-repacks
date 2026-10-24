import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, ts } from 'ts-morph';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let tempDir;
let consumerDir;
let installedDir;
const resolutions = [
  ['bundler', { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }],
  ['node16', {}],
  ['nodenext', { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }],
];

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dayjs-packed-'));
  const stagingDir = join(tempDir, 'staging');
  mkdirSync(stagingDir);
  for (const file of ['package.json', 'README.md', 'dist']) {
    cpSync(join(pkgDir, file), join(stagingDir, file), { recursive: true });
  }
  symlinkSync(join(pkgDir, 'node_modules'), join(stagingDir, 'node_modules'), 'dir');
  execFileSync('pnpm', ['pack', '--pack-destination', tempDir], { cwd: stagingDir, stdio: 'pipe' });

  consumerDir = join(tempDir, 'consumer');
  installedDir = join(consumerDir, 'node_modules', '@esm-repacks', 'dayjs');
  mkdirSync(installedDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), '{"type":"module"}');
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  execFileSync('tar', ['-xzf', join(tempDir, `esm-repacks-dayjs-${version}.tgz`),
    '-C', installedDir, '--strip-components=1']);
}, 30000);

afterAll(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

it('includes the complete upstream license in the packed package', () => {
  expect(readFileSync(join(installedDir, 'LICENSE'), 'utf8')).toBe(
    readFileSync(join(pkgDir, 'node_modules', 'dayjs', 'LICENSE'), 'utf8'),
  );
});

it('preserves the repack version and upstream version in the packed manifest', () => {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const packed = JSON.parse(readFileSync(join(installedDir, 'package.json'), 'utf8'));
  expect(packed.version).toBe(pkg.version);
  expect(packed.upstreamVersion).toBe(pkg.upstreamVersion);
  expect(packed.upstreamVersion).toBeDefined();
});

function typecheck(source, options = {}) {
  const file = join(consumerDir, 'index.ts');
  writeFileSync(file, source);
  const project = new Project({
    compilerOptions: {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      noEmit: true,
      types: [],
      ...options,
    },
  });
  project.addSourceFileAtPath(file);
  return project.getPreEmitDiagnostics().map(d => ts.flattenDiagnosticMessageText(d.compilerObject.messageText, '\n'));
}

it('exports Dayjs as a type while preserving plugin constructors and augmentation', () => {
  expect(typecheck(`
    import dayjs, { Dayjs } from '@esm-repacks/dayjs';
    import utc from '@esm-repacks/dayjs/plugin/utc';
    dayjs.extend(utc);
    const date: Dayjs = dayjs().utc();
    dayjs.extend((_option, Constructor) => {
      const instance: Dayjs = new Constructor('2023-06-15');
      instance.utc();
      Constructor.prototype.utc();
    });
    // @ts-expect-error Dayjs has no named runtime export.
    new Dayjs();
  `)).toEqual([]);
});

it.each(resolutions)('types standalone locale imports with %s resolution', (_name, options) => {
  expect(typecheck(`
    import fr from '@esm-repacks/dayjs/locale/fr';
    import de from '@esm-repacks/dayjs/locale/de';
    const names: string[] = [fr.name, de.name];
    // @ts-expect-error Locale names are strings, not numbers or any.
    const invalid: number = fr.name;
  `, options)).toEqual([]);
});

it.each(resolutions)('rejects unexported locale imports with %s resolution', (_name, options) => {
  expect(typecheck(`
    import dayjs from '@esm-repacks/dayjs';
    import fr from '@esm-repacks/dayjs/locale/fr';
    import missing from '@esm-repacks/dayjs/locale/does-not-exist';
    import internal from '@esm-repacks/dayjs/locale/types';
    dayjs.locale(fr.name);
  `, options)).toEqual([
    expect.stringContaining("Cannot find module '@esm-repacks/dayjs/locale/does-not-exist'"),
    expect.stringContaining("Cannot find module '@esm-repacks/dayjs/locale/types'"),
  ]);
});

it('imports every packed entry with native Node.js resolution', () => {
  const { exports } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    for (const entry of ${JSON.stringify(Object.keys(exports))}) {
      await import('@esm-repacks/dayjs' + (entry === '.' ? '' : entry.slice(1)));
    }
    const { default: dayjs } = await import('@esm-repacks/dayjs');
    const { default: utc } = await import('@esm-repacks/dayjs/plugin/utc');
    const { default: localizedFormat } = await import('@esm-repacks/dayjs/plugin/localizedFormat');
    dayjs.extend(utc);
    dayjs.extend(localizedFormat);
    assert.equal(dayjs.utc('2023-06-15').locale('fr').format('LL'), '15 juin 2023');
    console.log('ok');
  `], { cwd: consumerDir, encoding: 'utf8', stdio: 'pipe' });
  expect(output.trim()).toBe('ok');
});
