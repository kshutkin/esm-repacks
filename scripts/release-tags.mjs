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
  execFileSync('git', ['tag', '-a', tag, '-m', tag], { stdio: 'inherit' });
}
execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' });
