import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let tempDir;
let consumerDir;

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
  const installedDir = join(consumerDir, 'node_modules', '@esm-repacks', 'dayjs');
  mkdirSync(installedDir, { recursive: true });
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  execFileSync('tar', ['-xzf', join(tempDir, `esm-repacks-dayjs-${version}.tgz`),
    '-C', installedDir, '--strip-components=1']);
}, 30000);

afterAll(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
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
