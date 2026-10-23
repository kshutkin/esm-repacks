import { readFileSync, writeFileSync } from 'node:fs';

const [previousVersion, nextVersion] = process.argv.slice(2);
if (!previousVersion || !nextVersion) {
  throw new Error('Usage: node scripts/dayjs-changeset.mjs <previous-version> <next-version>');
}
if (previousVersion === nextVersion) process.exit(0);

const [previousMajor, previousMinor] = previousVersion.split('.');
const [nextMajor, nextMinor] = nextVersion.split('.');
const type = previousMajor !== nextMajor ? 'major' : previousMinor !== nextMinor ? 'minor' : 'patch';
const { name } = JSON.parse(readFileSync('packages/dayjs/package.json', 'utf8'));
writeFileSync('.changeset/dayjs-upstream-update.md',
  `---\n"${name}": ${type}\n---\n\nUpdate dayjs from ${previousVersion} to ${nextVersion}.\n`);
