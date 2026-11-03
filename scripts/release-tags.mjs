import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync('packages/dayjs/package.json', 'utf8'));
// pnpm passes its own settings through npm_config_ variables that npm rejects.
const npmEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^npm_config_(?:verify[-_]deps[-_]before[-_]run|npm[-_]globalconfig|_jsr[-_]registry|manage[-_]package[-_]manager[-_]versions)$/i.test(key),
));

async function viewPublishedField(field) {
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const output = execFileSync('npm', ['view', `${name}@${version}`, field, '--json', '--prefer-online'], {
        encoding: 'utf8', env: npmEnv, stdio: 'pipe',
      }).trim();
      return output ? JSON.parse(output) : '';
    } catch (error) {
      let code;
      try {
        code = JSON.parse(error.stdout).error?.code;
      } catch {
        // A failed executable or malformed response is not registry propagation.
      }
      if (code !== 'E404') throw error;
      if (attempt === attempts) {
        throw new Error(`Cannot verify ${name}@${version} ${field} after ${attempts} attempts. Rerun release:tags once the registry exposes the published release.`, { cause: error });
      }
      console.warn(`${name}@${version} is not visible in the registry yet; retrying in 5s (${attempt}/${attempts}).`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

const publishedVersion = await viewPublishedField('version');
if (publishedVersion !== version) {
  throw new Error(`Expected ${name}@${version} to be published before tagging`);
}

const tag = `${name}@${version}`;
const existingTag = execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' }).trim();
if (!existingTag) {
  const gitHead = await viewPublishedField('gitHead');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(gitHead)) {
    throw new Error(`Cannot recover ${tag}: registry gitHead is missing or invalid. Restore the tag at the verified release commit manually.`);
  }
  const commit = execFileSync('git', ['rev-parse', '--verify', `${gitHead}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['tag', '-a', tag, commit, '-m', tag], { stdio: 'inherit' });
}
execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' });
