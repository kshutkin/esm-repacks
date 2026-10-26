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
  const registryFile = join(temp, 'registry.json');
  writeFileSync(registryFile, '{}');
  // Only registry reads are allowed; an accidental publish fails the test.
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
    const assert = require('node:assert/strict');
    const args = process.argv.slice(2);
    assert.equal(args[0], 'view');
    assert.equal(args.length, 3);
    assert.ok(['version', 'gitHead'].includes(args[2]));
    const pkg = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(registryFile)}, 'utf8'))[args[1]];
    if (!pkg) process.exit(1);
    console.log(pkg[args[2]]);
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
  const setPublishedCommit = (commit, version = '1.11.23') => {
    const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
    registry[`@esm-repacks/dayjs@${version}`] = { version, gitHead: commit };
    writeFileSync(registryFile, JSON.stringify(registry));
  };
  if (published) setPublishedCommit(git('rev-parse', 'HEAD'));
  const options = { cwd, env: { ...process.env, PATH: bin + delimiter + process.env.PATH }, stdio: 'pipe' };
  const run = () => execFileSync(process.execPath, [script], options);
  return { git, run, remote, setPublishedCommit, cwd, options };
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

test('recovers a failed tag push before versioning a newer upstream release', t => {
  const { git, run, remote, setPublishedCommit, cwd, options } = fixture(t);
  const publishedCommit = git('rev-parse', 'HEAD');
  const hook = join(remote, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(run);
  rmSync(hook);
  // A fresh runner loses the local tag left by the failed push.
  git('tag', '-d', tag);
  git('commit', '--quiet', '--allow-empty', '-m', 'Later changes');

  const workflow = readFileSync(new URL('../../.github/workflows/check-updates.yml', import.meta.url), 'utf8');
  const stepName = '      - name: Recover published release tag\n';
  const step = workflow.split(stepName)[1]?.split('\n      - name:')[0];
  assert.ok(step, 'workflow must recover the published release before updating');
  assert.ok(workflow.indexOf('      - name: Configure Git\n') < workflow.indexOf(stepName));
  assert.ok(workflow.indexOf(stepName) < workflow.indexOf('      - name: Update dayjs\n'));
  assert.match(step, /if: steps\.compare\.outputs\.changed == 'true' && steps\.release\.outputs\.pending == 'false'/);
  writeFileSync(join(cwd, 'release-tags.mjs'), readFileSync(script));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    scripts: { 'release:tags': 'node release-tags.mjs' },
  }));
  const command = step.match(/^        run: (.+)$/m)[1];
  execFileSync('bash', ['-eu', '-o', 'pipefail', '-c', command], options);
  assert.equal(git('rev-parse', `${tag}^{commit}`), publishedCommit);
  assert.ok(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));

  // The subsequent release must still get its own tag at its own commit.
  writeFileSync(join(cwd, 'packages', 'dayjs', 'package.json'), JSON.stringify({
    name: '@esm-repacks/dayjs', version: '1.11.24',
  }));
  git('add', '.');
  git('commit', '--quiet', '-m', 'Release 1.11.24');
  const nextCommit = git('rev-parse', 'HEAD');
  setPublishedCommit(nextCommit, '1.11.24');
  const finalStep = workflow.split('      - name: Push release tags\n')[1];
  execFileSync('bash', ['-eu', '-o', 'pipefail', '-c', finalStep.match(/^        run: (.+)$/m)[1]], options);
  assert.equal(git('rev-parse', `${tag}^{commit}`), publishedCommit);
  assert.equal(git('rev-parse', '@esm-repacks/dayjs@1.11.24^{commit}'), nextCommit);
  assert.ok(git('ls-remote', '--tags', 'origin', 'refs/tags/@esm-repacks/dayjs@1.11.24'));
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
