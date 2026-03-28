import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, SyntaxKind } from 'ts-morph';

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

/**
 * Rewrite module names from dayjs/dayjs/esm to @esm-repacks/dayjs
 */
function rewriteModuleNames(content) {
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
  return content;
}

// ---------------------------------------------------------------------------
// ts-morph helpers
// ---------------------------------------------------------------------------

/**
 * Create a throwaway ts-morph source file for AST-based parsing.
 */
function parseSource(content, fileName = '__input.d.ts') {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(fileName, content);
}

/**
 * Map each statement inside a block (namespace / module) to its chunk of
 * source lines.  Lines between the end of the previous statement and the end
 * of the current one are grouped together, so leading blank lines / JSDoc
 * comments are naturally captured – mirroring the old `parseChunks` behaviour.
 *
 * `bodyStartLine` is the 0-based line index of the first body line (the line
 * immediately after the opening `{`).
 */
function statementsToChunks(statements, allLines, bodyStartLine) {
  const chunks = [];
  let prevEnd = bodyStartLine;

  for (const stmt of statements) {
    const stmtEndIdx = stmt.getEndLineNumber() - 1; // 0-based, inclusive
    const chunkLines = allLines.slice(prevEnd, stmtEndIdx + 1);
    prevEnd = stmtEndIdx + 1;

    const kind = stmt.getKind();
    const isFunction = kind === SyntaxKind.FunctionDeclaration;
    const isVariable = kind === SyntaxKind.VariableStatement;
    const isClass = kind === SyntaxKind.ClassDeclaration;
    const name = typeof stmt.getName === 'function' ? stmt.getName() : undefined;

    chunks.push({
      isStatic: isFunction || isVariable,
      isFunction,
      isClass,
      name,
      lines: chunkLines,
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Transform: index.d.ts
// ---------------------------------------------------------------------------

function transformIndexDts(content) {
  const sf = parseSource(content, 'index.d.ts');
  const lines = content.split('\n');

  // 1. Collect reference lines
  const referenceLines = lines.filter(l => l.trim().startsWith('///'));

  // 2. Collect declare function dayjs(...) overloads
  const callSignatureLines = [];
  for (const func of sf.getFunctions()) {
    if (func.getName() === 'dayjs') {
      const start = func.getStartLineNumber() - 1;
      const end = func.getEndLineNumber() - 1;
      for (let i = start; i <= end; i++) {
        callSignatureLines.push(lines[i]);
      }
    }
  }

  // 3. Find namespace body
  const ns = sf.getModule('dayjs');
  if (!ns) {
    // No namespace found, return content with just export = replaced
    return content.replace(/export\s*=\s*dayjs\s*;?/, 'export default dayjs;');
  }

  const nsStartIdx = ns.getStartLineNumber() - 1;

  // 4. Classify namespace members into type-level vs static chunks
  const chunks = statementsToChunks(ns.getStatements(), lines, nsStartIdx + 1);
  const typeChunks = chunks.filter(c => !c.isStatic);
  const staticChunks = chunks.filter(c => c.isStatic);

  // 5. Build output
  const out = [];

  // Reference lines
  for (const ref of referenceLines) {
    out.push(ref);
  }
  if (referenceLines.length > 0) out.push('');

  // Type/interface/class declarations at module level
  for (const chunk of typeChunks) {
    for (const line of chunk.lines) {
      // Strip namespace-level indentation (2 spaces)
      let transformed = line.replace(/^  /, '');
      const trimmed = transformed.trim();
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) {
        out.push(transformed);
        continue;
      }

      // For lines that start a declaration (interface, type, class) — ensure `export`
      if (/^(interface|type|class)\s/.test(trimmed)) {
        // Add export if not already present
        if (!/^export\s/.test(trimmed)) {
          transformed = 'export ' + transformed;
        }
      }

      // Fix PluginFunc: change `typeof dayjs` to `DayjsStatic`
      transformed = transformed.replace(/typeof\s+dayjs(?!\w)/g, 'DayjsStatic');

      out.push(transformed);
    }
    // After class Dayjs, add the empty interface merge point for plugin augmentation
    if (chunk.isClass && chunk.name === 'Dayjs') {
      out.push('export interface Dayjs {}');
    }
    out.push('');
  }

  // DayjsStatic interface
  out.push('// Exported interface describing the callable + statics.');
  out.push('// Plugins augment this via interface merging in their declare module blocks.');
  out.push('export interface DayjsStatic {');

  // Add call signatures from the declare function dayjs(...) overloads
  for (const sigLine of callSignatureLines) {
    // Convert: declare function dayjs (date?: dayjs.ConfigType): dayjs.Dayjs
    //      To: (date?: ConfigType): Dayjs;
    let sig = sigLine.trim();
    // Remove "declare function dayjs" prefix
    sig = sig.replace(/^declare\s+function\s+dayjs\s*/, '');
    // Remove dayjs. prefix from types
    sig = sig.replace(/dayjs\./g, '');
    // Ensure trailing semicolon
    if (!sig.endsWith(';')) sig += ';';
    out.push('  ' + sig);
  }

  // Add static method/property signatures from namespace
  for (const chunk of staticChunks) {
    for (const line of chunk.lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) {
        // Re-indent comments/blanks for DayjsStatic body
        out.push(trimmed === '' ? '' : '  ' + trimmed);
        continue;
      }

      let transformed = trimmed;

      if (chunk.isFunction) {
        // Convert: export function extend<T = unknown>(plugin: PluginFunc<T>, option?: T): Dayjs
        //      To: extend<T = unknown>(plugin: PluginFunc<T>, option?: T): DayjsStatic;
        transformed = transformed
          .replace(/^export\s+/, '')
          .replace(/^function\s+/, '');
        // Fix extend return type: Dayjs → DayjsStatic
        if (/^extend\s*[<(]/.test(transformed)) {
          transformed = transformed.replace(/\):\s*Dayjs\s*;?\s*$/, '): DayjsStatic;');
          if (!transformed.endsWith(';')) transformed += ';';
        } else {
          if (!transformed.endsWith(';')) transformed += ';';
        }
      } else {
        // const/let/var → readonly property
        transformed = transformed
          .replace(/^export\s+/, '')
          .replace(/^(const|let|var)\s+/, 'readonly ');
        if (!transformed.endsWith(';')) transformed += ';';
      }

      out.push('  ' + transformed);
    }
  }

  out.push('}');
  out.push('');
  out.push('declare const dayjs: DayjsStatic;');
  out.push('export default dayjs;');
  out.push('');

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Transform: plugin .d.ts
// ---------------------------------------------------------------------------

function transformPluginDts(content) {
  // Pattern A: export = plugin → export default plugin
  content = content.replace(/^export\s*=\s*plugin\s*;?\s*$/gm, 'export default plugin;');

  // Pattern B: Remove "export as namespace plugin;"
  content = content.replace(/^export\s+as\s+namespace\s+plugin\s*;?\s*$/gm, '');

  // Pattern C: declare namespace plugin { ... } — leave unchanged (handled implicitly)

  // Now handle declare module blocks — Patterns D through I
  content = transformDeclareModuleBlocks(content);

  return content;
}

/**
 * Find and transform all `declare module '@esm-repacks/dayjs' { ... }` blocks
 * in a plugin .d.ts file.  Functions and variables inside these blocks are
 * moved into a `DayjsStatic` interface; everything else (interfaces, types)
 * is kept in place.
 */
function transformDeclareModuleBlocks(content) {
  const sf = parseSource(content, '__plugin.d.ts');
  const lines = content.split('\n');
  const result = [];
  let processedUpTo = 0; // 0-based line index

  for (const mod of sf.getModules()) {
    const name = mod.getName();
    // Only process declare module '@esm-repacks/dayjs' blocks
    if (name !== "'@esm-repacks/dayjs'" && name !== '"@esm-repacks/dayjs"') continue;

    const modStartIdx = mod.getStartLineNumber() - 1;
    const modEndIdx = mod.getEndLineNumber() - 1;

    // Copy lines before this module block
    for (let i = processedUpTo; i < modStartIdx; i++) {
      result.push(lines[i]);
    }

    // Classify module statements
    const chunks = statementsToChunks(mod.getStatements(), lines, modStartIdx + 1);
    const keepChunks = chunks.filter(c => !c.isStatic);
    const staticMembers = chunks.filter(c => c.isStatic);

    // Rebuild the declare module block
    result.push(lines[modStartIdx]); // declare module '...' {

    for (const chunk of keepChunks) {
      for (const line of chunk.lines) {
        result.push(line);
      }
    }

    if (staticMembers.length > 0) {
      result.push('  interface DayjsStatic {');

      for (const member of staticMembers) {
        for (const line of member.lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/**')) {
            // Re-indent comments/blanks for DayjsStatic body inside declare module
            result.push(trimmedLine === '' ? '' : '    ' + trimmedLine);
            continue;
          }

          let transformed = trimmedLine;

          if (member.isFunction) {
            // export function utc(config?: ConfigType, format?: string, strict?: boolean): Dayjs;
            // → utc(config?: ConfigType, format?: string, strict?: boolean): Dayjs;
            transformed = transformed
              .replace(/^export\s+/, '')
              .replace(/^function\s+/, '');
            if (!transformed.endsWith(';')) transformed += ';';
          } else {
            // export const duration: plugin.CreateDurationType;
            // → readonly duration: plugin.CreateDurationType;
            // Also handle: const tz: DayjsTimezone (no export)
            transformed = transformed
              .replace(/^export\s+/, '')
              .replace(/^(const|let|var)\s+/, 'readonly ');
            if (!transformed.endsWith(';')) transformed += ';';
          }

          result.push('    ' + transformed);
        }
      }

      result.push('  }');
    }

    result.push(lines[modEndIdx]); // closing }

    processedUpTo = modEndIdx + 1;
  }

  // Copy remaining lines
  for (let i = processedUpTo; i < lines.length; i++) {
    result.push(lines[i]);
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Main copy+transform for .d.ts files
// ---------------------------------------------------------------------------

/**
 * @param {'index' | 'plugin' | 'locale'} kind
 */
function copyAndTransformDts(src, dest, kind = 'locale') {
  let content = readFileSync(src, 'utf8');

  // First: rewrite module names (dayjs → @esm-repacks/dayjs)
  content = rewriteModuleNames(content);

  // Then apply structural transforms based on kind
  if (kind === 'index') {
    content = transformIndexDts(content);
  } else if (kind === 'plugin') {
    content = transformPluginDts(content);
  } else if (kind === 'locale') {
    // Locale .d.ts files (e.g. locale/index.d.ts) may contain `export = locale`
    // inside ambient module declarations. Replace with `export default` for ESM compat.
    content = content.replace(/^(\s*)export\s*=\s*(\w+)\s*;?\s*$/gm, '$1export default $2;');
  }

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
        copyAndTransformDts(srcPath, destPath, 'plugin');
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
copyAndTransformDts(join(dayjsEsmDir, 'index.d.ts'), join(distDir, 'index.d.ts'), 'index');

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
    copyAndTransformDts(src, join(localeDestDir, file), 'locale');
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
