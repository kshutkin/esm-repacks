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
    const args = process.argv.slice(2);
    assert.deepEqual(args.slice(0, 2), ['view', '@esm-repacks/dayjs@1.11.23']);
    assert.equal(args.length, 3);
    if (!${published}) process.exit(1);
    if (args[2] === 'version') console.log('1.11.23');
    else {
      assert.equal(args[2], 'gitHead');
      console.log(require('node:fs').readFileSync(${JSON.stringify(join(temp, 'git-head'))}, 'utf8'));
    }
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
  const setPublishedCommit = commit => writeFileSync(join(temp, 'git-head'), commit);
  setPublishedCommit(git('rev-parse', 'HEAD'));
  const run = () => execFileSync(process.execPath, [script], {
    cwd, env: { ...process.env, PATH: bin + delimiter + process.env.PATH }, stdio: 'pipe',
  });
  return { git, run, remote, setPublishedCommit };
}

test('recovers and pushes a missing tag for an already published version', t => {
  const { git, run } = fixture(t);
  const commit = git('rev-parse', 'HEAD');
  run();
  assert.equal(git('cat-file', '-t', tag), 'tag');
  assert.equal(git('rev-parse', `${tag}^{commit}`), commit);
  assert.ok(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
});

test('recovers a lost tag at the published commit after main advances', t => {
  const { git, run } = fixture(t);
  const publishedCommit = git('rev-parse', 'HEAD');
  git('commit', '--quiet', '--allow-empty', '-m', 'Unreleased changes');
  run();
  assert.equal(git('rev-parse', `${tag}^{commit}`), publishedCommit);
  assert.ok(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
});

for (const commit of ['', 'main', '0'.repeat(40)]) {
  test(`does not guess a release commit when gitHead is ${commit || 'missing'}`, t => {
    const { git, run, setPublishedCommit } = fixture(t);
    setPublishedCommit(commit);
    assert.throws(run);
    assert.equal(git('tag', '--list'), '');
    assert.equal(git('ls-remote', '--tags', 'origin'), '');
  });
}

test('pushes an existing tag even when registry gitHead is missing', t => {
  const { git, run, setPublishedCommit } = fixture(t);
  git('tag', '-a', tag, '-m', tag);
  const object = git('rev-parse', tag);
  setPublishedCommit('');
  git('commit', '--quiet', '--allow-empty', '-m', 'Later commit');
  run();
  assert.equal(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`).split(/\s/)[0], object);
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
