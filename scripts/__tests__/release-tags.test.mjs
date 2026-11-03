import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../release-tags.mjs', import.meta.url));
const tag = '@esm-repacks/dayjs@1.11.23';

function fixture(t, published = true, npmEnv = {}) {
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
  const responsesFile = join(temp, 'responses.json');
  const requestsFile = join(temp, 'requests.json');
  const envFile = join(temp, 'npm-env.json');
  writeFileSync(registryFile, '{}');
  writeFileSync(responsesFile, '{}');
  writeFileSync(requestsFile, '[]');
  // Advance retry timers immediately without adding a production-only test knob.
  const clock = join(temp, 'clock.mjs');
  writeFileSync(clock, 'globalThis.setTimeout = callback => callback();\n');
  // Only registry reads are allowed; an accidental publish fails the test.
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
    const assert = require('node:assert/strict');
    const args = process.argv.slice(2);
    assert.equal(args[0], 'view');
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(envFile)}, JSON.stringify(Object.fromEntries(
      ${JSON.stringify(Object.keys(npmEnv))}.map(key => [key, process.env[key]])
    )));
    const requests = JSON.parse(fs.readFileSync(${JSON.stringify(requestsFile)}, 'utf8'));
    requests.push(args);
    fs.writeFileSync(${JSON.stringify(requestsFile)}, JSON.stringify(requests));
    assert.ok(['version', 'gitHead'].includes(args[2]));
    assert.deepEqual(args.slice(3), ['--json', '--prefer-online']);
    const responses = JSON.parse(fs.readFileSync(${JSON.stringify(responsesFile)}, 'utf8'));
    const response = responses[args[2]]?.shift();
    fs.writeFileSync(${JSON.stringify(responsesFile)}, JSON.stringify(responses));
    if (response?.error) {
      console.log(JSON.stringify(response));
      console.error('npm error code ' + response.error.code);
      process.exit(1);
    }
    const pkg = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(registryFile)}, 'utf8'))[args[1]];
    if (!pkg) {
      console.log(JSON.stringify({ error: { code: 'E404' } }));
      process.exit(1);
    }
    const value = response ?? pkg[args[2]];
    console.log(args.includes('--json') ? JSON.stringify(value) : value);
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
  const options = { cwd, env: { ...process.env, ...npmEnv, PATH: bin + delimiter + process.env.PATH }, stdio: 'pipe' };
  const run = () => execFileSync(process.execPath, ['--import', clock, script], options);
  const setResponses = responses => writeFileSync(responsesFile, JSON.stringify(responses));
  const requests = () => JSON.parse(readFileSync(requestsFile, 'utf8'));
  const receivedEnv = () => JSON.parse(readFileSync(envFile, 'utf8'));
  return { git, run, remote, setPublishedCommit, cwd, options, setResponses, requests, receivedEnv };
}

for (const field of ['version', 'gitHead']) {
  test(`retries a registry E404 for ${field} after publication`, t => {
    const { git, run, setResponses, requests } = fixture(t);
    setResponses({ [field]: [{ error: { code: 'E404' } }, { error: { code: 'E404' } }] });
    run();
    assert.equal(requests().filter(args => args[2] === field).length, 3);
    assert.ok(requests().every(args => args.includes('--prefer-online')));
    assert.ok(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
  });
}

test('fails immediately for registry authentication errors', t => {
  const { git, run, setResponses, requests } = fixture(t);
  setResponses({ version: [{ error: { code: 'E401' } }] });
  assert.throws(run);
  assert.equal(requests().length, 1);
  assert.equal(git('tag', '--list'), '');
});

test('bounds retries and leaves unpublished versions untagged', t => {
  const { git, run, requests } = fixture(t, false);
  assert.throws(run, /after 6 attempts/);
  assert.equal(requests().length, 6);
  assert.equal(git('tag', '--list'), '');
  assert.equal(git('ls-remote', '--tags', 'origin'), '');
});

test('removes pnpm-only npm settings while preserving registry and authentication', t => {
  const pnpmOnly = {
    npm_config_verify_deps_before_run: 'true',
    npm_config_npm_globalconfig: '/pnpm/npmrc',
    npm_config__jsr_registry: 'https://npm.jsr.io/',
    NPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS: 'true',
  };
  const supported = {
    npm_config_registry: 'https://registry.example.invalid/',
    npm_config_userconfig: '/user/npmrc',
    npm_config_globalconfig: '/global/npmrc',
    NODE_AUTH_TOKEN: 'fixture-token',
    NPM_TOKEN: 'fixture-token',
  };
  const { run, receivedEnv } = fixture(t, true, { ...pnpmOnly, ...supported });
  run();
  const env = receivedEnv();
  for (const key of Object.keys(pnpmOnly)) assert.equal(env[key], undefined);
  for (const [key, value] of Object.entries(supported)) assert.equal(env[key], value);
});

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
