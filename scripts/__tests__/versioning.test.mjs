import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const changesetScript = join(root, 'scripts', 'dayjs-changeset.mjs');

function fixture(t, version = '1.11.23') {
  const cwd = mkdtempSync(join(tmpdir(), 'repack-versioning-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, 'packages', 'dayjs', 'scripts'), { recursive: true });
  mkdirSync(join(cwd, '.changeset'));
  for (const file of ['package.json', 'pnpm-workspace.yaml', '.changeset/config.json']) {
    cpSync(join(root, file), join(cwd, file));
  }
  symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
  const manifest = join(cwd, 'packages', 'dayjs', 'package.json');
  const pkg = JSON.parse(readFileSync(join(root, 'packages', 'dayjs', 'package.json'), 'utf8'));
  pkg.version = version;
  writeFileSync(manifest, JSON.stringify(pkg, null, 2) + '\n');
  const changelog = join(cwd, 'packages', 'dayjs', 'CHANGELOG.md');
  writeFileSync(changelog, '# @esm-repacks/dayjs\n\n## ' + version + '\n\n- Existing release\n');
  const readPackage = () => JSON.parse(readFileSync(manifest, 'utf8'));
  const bump = () => execFileSync('pnpm', ['run', 'version-packages'], { cwd, stdio: 'pipe' });
  const upstream = (from, to) => {
    const current = readPackage();
    current.devDependencies.dayjs = to;
    writeFileSync(manifest, JSON.stringify(current, null, 2) + '\n');
    execFileSync(process.execPath, [changesetScript, from, to], { cwd, stdio: 'pipe' });
    bump();
  };
  return { cwd, manifest, changelog, readPackage, bump, upstream };
}

test('a manual repack patch does not consume the next upstream release', t => {
  const { cwd, readPackage, bump, upstream, changelog } = fixture(t);
  writeFileSync(join(cwd, '.changeset', 'manual-fix.md'),
    '---\n"@esm-repacks/dayjs": patch\n---\n\nFix the repack.\n');
  bump();
  assert.equal(readPackage().version, '1.11.24');
  upstream('1.11.23', '1.11.24');
  assert.equal(readPackage().version, '1.11.25');
  assert.equal(readPackage().devDependencies.dayjs, '1.11.24');
  assert.match(readFileSync(changelog, 'utf8'), /Update dayjs from 1\.11\.23 to 1\.11\.24/);
});

for (const [upstreamVersion, repackVersion] of [['1.12.0', '2.5.0'], ['2.0.0', '3.0.0']]) {
  test(`upstream ${upstreamVersion} advances an independent repack to ${repackVersion}`, t => {
    const { upstream, readPackage } = fixture(t, '2.4.7');
    upstream('1.11.23', upstreamVersion);
    assert.equal(readPackage().version, repackVersion);
  });
}

test('repeated builds and packing preserve independent version metadata', t => {
  const { cwd, readPackage, changelog } = fixture(t, '2.4.7');
  const pkgDir = join(cwd, 'packages', 'dayjs');
  const script = join(pkgDir, 'scripts', 'repack.mjs');
  cpSync(join(root, 'packages', 'dayjs', 'scripts', 'repack.mjs'), script);
  symlinkSync(join(root, 'packages', 'dayjs', 'node_modules'), join(pkgDir, 'node_modules'), 'dir');
  const previousChangelog = readFileSync(changelog, 'utf8');
  const installedUpstream = JSON.parse(readFileSync(join(pkgDir, 'node_modules', 'dayjs', 'package.json'), 'utf8')).version;
  for (let i = 0; i < 2; i++) {
    execFileSync(process.execPath, [script], { cwd, stdio: 'pipe' });
    assert.equal(readPackage().version, '2.4.7');
    assert.equal(readPackage().upstreamVersion, installedUpstream);
    assert.equal(readFileSync(changelog, 'utf8'), previousChangelog);
  }
  execFileSync('pnpm', ['pack', '--pack-destination', cwd], { cwd: pkgDir, stdio: 'pipe' });
  const packed = JSON.parse(execFileSync('tar', [
    '-xOf', join(cwd, 'esm-repacks-dayjs-2.4.7.tgz'), 'package/package.json',
  ], { encoding: 'utf8' }));
  assert.equal(packed.version, '2.4.7');
  assert.equal(packed.upstreamVersion, installedUpstream);
});

for (const published of [false, true]) {
  test(`an independent release is ${published ? 'complete' : 'pending'} based on its exact npm version`, t => {
    const { cwd } = fixture(t, '2.4.7');
    const bin = join(cwd, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
      const assert = require('node:assert/strict');
      assert.deepEqual(process.argv.slice(2), ['view', '@esm-repacks/dayjs@2.4.7', 'version']);
      if (${published}) console.log('2.4.7');
      else process.exit(1);
    `, { mode: 0o755 });
    const workflow = readFileSync(join(root, '.github', 'workflows', 'check-updates.yml'), 'utf8');
    const step = workflow.split('      - name: Check for an unpublished release\n')[1].split('\n      - name:')[0];
    const script = step.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    const output = join(cwd, 'outputs');
    execFileSync('bash', ['-eu', '-o', 'pipefail', '-c', script], {
      cwd, stdio: 'pipe',
      env: { ...process.env, LATEST_VERSION: '1.11.23', GITHUB_OUTPUT: output, PATH: bin + delimiter + process.env.PATH },
    });
    assert.equal(readFileSync(output, 'utf8').trim(), `pending=${!published}`);
  });
}
