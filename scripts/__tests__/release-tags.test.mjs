import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../release-tags.mjs', import.meta.url));
const tag = '@esm-repacks/dayjs@1.11.23';

function fixture(t, published = true) {
  const temp = mkdtempSync(join(tmpdir(), 'release-tags-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const cwd = join(temp, 'work');
  const remote = join(temp, 'remote.git');
  const bin = join(temp, 'bin');
  mkdirSync(join(cwd, 'packages', 'dayjs'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(cwd, 'packages', 'dayjs', 'package.json'), JSON.stringify({
    name: '@esm-repacks/dayjs', version: '1.11.23',
  }));
  // Only registry reads are allowed; an accidental publish fails the test.
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
    const assert = require('node:assert/strict');
    assert.deepEqual(process.argv.slice(2), ['view', '@esm-repacks/dayjs@1.11.23', 'version']);
    if (${published}) console.log('1.11.23');
    else process.exit(1);
  `, { mode: 0o755 });
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.invalid');
  git('init', '--bare', '--quiet', '--initial-branch=main', remote);
  git('remote', 'add', 'origin', remote);
  git('add', '.');
  git('commit', '--quiet', '-m', 'Release fixture');
  git('push', '--quiet', 'origin', 'HEAD:main');
  const run = () => execFileSync(process.execPath, [script], {
    cwd, env: { ...process.env, PATH: bin + delimiter + process.env.PATH }, stdio: 'pipe',
  });
  return { git, run, remote };
}

test('recovers and pushes a missing tag for an already published version', t => {
  const { git, run } = fixture(t);
  const commit = git('rev-parse', 'HEAD');
  run();
  assert.equal(git('cat-file', '-t', tag), 'tag');
  assert.equal(git('rev-parse', `${tag}^{commit}`), commit);
  assert.ok(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
});

test('retries a failed tag push without moving the release tag', t => {
  const { git, run, remote } = fixture(t);
  const hook = join(remote, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(run);
  const object = git('rev-parse', tag);
  assert.equal(git('ls-remote', '--tags', 'origin'), '');
  rmSync(hook);
  git('commit', '--quiet', '--allow-empty', '-m', 'Later commit');
  run();
  run();
  assert.equal(git('rev-parse', tag), object);
  assert.equal(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`).split(/\s/)[0], object);
});

test('does not tag or push an unpublished version', t => {
  const { git, run } = fixture(t, false);
  assert.throws(run);
  assert.equal(git('tag', '--list'), '');
  assert.equal(git('ls-remote', '--tags', 'origin'), '');
});

test('runs workflow tag recovery even when no package update is pending', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/check-updates.yml', import.meta.url), 'utf8');
  const step = workflow.split('      - name: Push release tags\n')[1].split('\n      - name:')[0];
  assert.doesNotMatch(step, /^\s+if:/m);
  assert.match(step, /run: pnpm run release:tags/);
});
