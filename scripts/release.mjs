import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const packagesDir = join(process.cwd(), 'packages');

const packages = readdirSync(packagesDir)
  .map(name => join(packagesDir, name))
  .filter(path => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  })
  .map(path => {
    try {
      return JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  })
  .filter(pkg => pkg && !pkg.private && pkg.name && pkg.version);

let hasUnpublished = false;

for (const pkg of packages) {
  try {
    const result = execSync(`npm view "${pkg.name}" versions --json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const versions = JSON.parse(result);
    const versionList = Array.isArray(versions) ? versions : [versions];
    if (versionList.includes(pkg.version)) {
      console.log(`Already published: ${pkg.name}@${pkg.version}, skipping`);
    } else {
      console.log(`Will publish: ${pkg.name}@${pkg.version}`);
      hasUnpublished = true;
    }
  } catch {
    // npm view fails if the package has never been published
    console.log(`New package: ${pkg.name}@${pkg.version}, will publish`);
    hasUnpublished = true;
  }
}

if (!hasUnpublished) {
  console.log('\nAll package versions are already published. Nothing to do.');
  process.exit(0);
}

console.log('\nPublishing unpublished packages...');
execSync('pnpm changeset publish', { stdio: 'inherit' });
