import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync('packages/dayjs/package.json', 'utf8'));
const publishedVersion = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
  encoding: 'utf8',
}).trim();
if (publishedVersion !== version) {
  throw new Error(`Expected ${name}@${version} to be published before tagging`);
}

const tag = `${name}@${version}`;
const existingTag = execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' }).trim();
if (!existingTag) {
  const gitHead = execFileSync('npm', ['view', `${name}@${version}`, 'gitHead'], {
    encoding: 'utf8',
  }).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(gitHead)) {
    throw new Error(`Cannot recover ${tag}: registry gitHead is missing or invalid. Restore the tag at the verified release commit manually.`);
  }
  const commit = execFileSync('git', ['rev-parse', '--verify', `${gitHead}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['tag', '-a', tag, commit, '-m', tag], { stdio: 'inherit' });
}
execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' });
