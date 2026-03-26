import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(__dirname, '..');
const distDir = join(pkgDir, 'dist');
const dayjsDir = join(pkgDir, 'node_modules', 'dayjs');
const dayjsEsmDir = join(dayjsDir, 'esm');

// --- Helpers ---

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function copyAndTransformJs(src, dest) {
  let content = readFileSync(src, 'utf8');
  writeFileSync(dest, content, 'utf8');
}

function copyAndTransformDts(src, dest) {
  let content = readFileSync(src, 'utf8');
  // Rewrite module declarations and imports from dayjs/esm → @esm-repacks/dayjs
  content = content.replace(/declare module 'dayjs\/esm'/g, "declare module '@esm-repacks/dayjs'");
  content = content.replace(/declare module 'dayjs\/esm\/(.*?)'/g, "declare module '@esm-repacks/dayjs/$1'");
  content = content.replace(/from 'dayjs\/esm'/g, "from '@esm-repacks/dayjs'");
  content = content.replace(/from 'dayjs\/esm\/(.*?)'/g, "from '@esm-repacks/dayjs/$1'");
  // Also handle CJS-style references (some .d.ts use 'dayjs' not 'dayjs/esm')
  content = content.replace(/declare module 'dayjs'/g, "declare module '@esm-repacks/dayjs'");
  content = content.replace(/declare module 'dayjs\/(.*?)'/g, "declare module '@esm-repacks/dayjs/$1'");
  content = content.replace(/from 'dayjs'/g, "from '@esm-repacks/dayjs'");
  content = content.replace(/from 'dayjs\/(.*?)'/g, "from '@esm-repacks/dayjs/$1'");
  // Fix reference paths
  content = content.replace(/\/\/\/ <reference path="\.\/locale\/index\.d\.ts" \/>/g, '/// <reference path="./locale/index.d.ts" />');
  writeFileSync(dest, content, 'utf8');
}

function fixPluginImports(filePath) {
  // Plugin files are in dist/plugin/{name}/index.js (same structure as dayjs/esm)
  // They import from ../../constant, ../../utils, ../../index which resolves correctly
  // No rewriting needed since we preserve the directory structure
}

function copyPluginDir(srcDir, destDir) {
  ensureDir(destDir);
  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);
    if (stat.isFile()) {
      if (entry.endsWith('.js')) {
        copyAndTransformJs(srcPath, destPath);
      } else if (entry.endsWith('.d.ts')) {
        copyAndTransformDts(srcPath, destPath);
      }
    }
  }
}

// --- Main ---

console.log('🔄 Starting dayjs ESM repack...');

// 1. Clean dist/
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}

// 2. Read dayjs version
const dayjsPkg = JSON.parse(readFileSync(join(dayjsDir, 'package.json'), 'utf8'));
const dayjsVersion = dayjsPkg.version;
console.log(`📦 dayjs version: ${dayjsVersion}`);

// 3. Copy core ESM files
ensureDir(distDir);
const coreFiles = ['index.js', 'constant.js', 'utils.js'];
for (const file of coreFiles) {
  copyAndTransformJs(join(dayjsEsmDir, file), join(distDir, file));
}
console.log(`✅ Copied core files: ${coreFiles.join(', ')}`);

// 4. Copy core .d.ts 
// Use the ESM version of index.d.ts (it uses dayjs/esm references)
copyAndTransformDts(join(dayjsEsmDir, 'index.d.ts'), join(distDir, 'index.d.ts'));

// 5. Copy plugins (preserve directory structure: plugin/{name}/index.js)
const pluginSrcDir = join(dayjsEsmDir, 'plugin');
const pluginDestDir = join(distDir, 'plugin');
ensureDir(pluginDestDir);

const plugins = readdirSync(pluginSrcDir).filter(name => {
  const stat = statSync(join(pluginSrcDir, name));
  return stat.isDirectory();
});

for (const name of plugins) {
  copyPluginDir(join(pluginSrcDir, name), join(pluginDestDir, name));
}
console.log(`✅ Copied ${plugins.length} plugins (with type declarations)`);

// 7. Copy locales
const localeSrcDir = join(dayjsEsmDir, 'locale');
const localeDestDir = join(distDir, 'locale');
ensureDir(localeDestDir);

const locales = readdirSync(localeSrcDir).filter(name => name.endsWith('.js'));

for (const file of locales) {
  copyAndTransformJs(join(localeSrcDir, file), join(localeDestDir, file));
}
console.log(`✅ Copied ${locales.length} locales`);

// 8. Copy locale type declarations
const localeDtsFiles = ['index.d.ts', 'types.d.ts'];
for (const file of localeDtsFiles) {
  const src = join(localeSrcDir, file);
  if (existsSync(src)) {
    copyAndTransformDts(src, join(localeDestDir, file));
  }
}
console.log(`✅ Copied locale type declarations`);

// 9. Generate exports map and update package.json
const pkgJsonPath = join(pkgDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

const exports = {
  '.': {
    types: './dist/index.d.ts',
    import: './dist/index.js'
  }
};

// Plugin exports (directory structure: plugin/{name}/index.js)
for (const name of plugins.sort()) {
  const entry = {
    import: `./dist/plugin/${name}/index.js`
  };
  const dtsPath = join(pluginDestDir, name, 'index.d.ts');
  if (existsSync(dtsPath)) {
    entry.types = `./dist/plugin/${name}/index.d.ts`;
  }
  exports[`./plugin/${name}`] = entry;
}

// Locale exports
const localeNames = locales.map(f => f.replace('.js', '')).sort();
for (const name of localeNames) {
  exports[`./locale/${name}`] = {
    import: `./dist/locale/${name}.js`
  };
}

pkg.version = dayjsVersion;
pkg.exports = exports;
pkg.main = './dist/index.js';
pkg.module = './dist/index.js';
pkg.types = './dist/index.d.ts';

writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`✅ Updated package.json (version: ${dayjsVersion}, ${Object.keys(exports).length} exports)`);

console.log('✅ Repack complete!');
