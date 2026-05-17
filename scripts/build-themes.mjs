#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const cacheDir = path.join(root, '.cache');
const vscodeDir = path.join(cacheDir, 'vscode');
const zedDir = path.join(cacheDir, 'zed');
const flattenedDir = path.join(cacheDir, 'flattened');
const importedDir = path.join(cacheDir, 'imported');
const cargoTargetDir = path.join(cacheDir, 'cargo-target');
const outputDir = path.join(root, 'themes');
const refresh = process.argv.includes('--refresh');

const sourceThemesDir = path.join(vscodeDir, 'extensions', 'theme-defaults', 'themes');

const zedWorkspaceMembers = [
  'crates/askpass',
  'crates/clock',
  'crates/cloud_llm_client',
  'crates/collections',
  'crates/fs',
  'crates/git',
  'crates/gpui',
  'crates/gpui_linux',
  'crates/gpui_macos',
  'crates/gpui_macros',
  'crates/gpui_platform',
  'crates/gpui_shared_string',
  'crates/gpui_util',
  'crates/gpui_web',
  'crates/gpui_wgpu',
  'crates/gpui_windows',
  'crates/http_client',
  'crates/http_client_tls',
  'crates/language_model_core',
  'crates/media',
  'crates/migrator',
  'crates/net',
  'crates/paths',
  'crates/proto',
  'crates/refineable',
  'crates/refineable/derive_refineable',
  'crates/release_channel',
  'crates/reqwest_client',
  'crates/rope',
  'crates/scheduler',
  'crates/settings',
  'crates/settings_content',
  'crates/settings_json',
  'crates/settings_macros',
  'crates/sum_tree',
  'crates/syntax_theme',
  'crates/telemetry',
  'crates/telemetry_events',
  'crates/text',
  'crates/theme',
  'crates/theme_importer',
  'crates/theme_settings',
  'crates/util',
  'crates/util_macros',
  'crates/zeta_prompt',
  'crates/zlog',
  'crates/ztracing',
  'crates/ztracing_macro',
  'tooling/perf',
];

const zedSparsePaths = [
  'Cargo.toml',
  'Cargo.lock',
  'assets/settings',
  'assets/keymaps',
  'crates/zed/RELEASE_CHANNEL',
  ...zedWorkspaceMembers,
];

function log(message) {
  console.log(`[build-themes] ${message}`);
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureGitRepo(dir, url, options = {}) {
  const { sparsePaths = [] } = options;

  if (!fs.existsSync(dir)) {
    ensureDir(path.dirname(dir));
    log(`cloning ${url}`);

    const cloneArgs = ['clone', '--depth', '1'];
    if (sparsePaths.length > 0) {
      cloneArgs.push('--filter=blob:none', '--sparse');
    }
    cloneArgs.push(url, dir);
    run('git', cloneArgs);

    if (sparsePaths.length > 0) {
      run('git', ['-C', dir, 'sparse-checkout', 'set', '--skip-checks', ...sparsePaths]);
    }

    return;
  }

  if (refresh) {
    log(`refreshing ${dir}`);
    run('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', 'main']);
    run('git', ['-C', dir, 'reset', '--hard', 'FETCH_HEAD']);
    run('git', ['-C', dir, 'clean', '-fd']);
  }

  if (sparsePaths.length > 0) {
    run('git', ['-C', dir, 'sparse-checkout', 'set', '--skip-checks', ...sparsePaths]);
  }
}

function parseJsoncFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return vm.runInNewContext(`(${source})`, Object.create(null), {
    filename: filePath,
    timeout: 1_000,
  });
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function mergeMaybe(baseValue, overrideValue) {
  if (overrideValue == null) {
    return cloneValue(baseValue);
  }

  if (baseValue == null) {
    return cloneValue(overrideValue);
  }

  if (Array.isArray(baseValue) && Array.isArray(overrideValue)) {
    return [...cloneValue(baseValue), ...cloneValue(overrideValue)];
  }

  if (
    typeof baseValue === 'object' &&
    typeof overrideValue === 'object' &&
    !Array.isArray(baseValue) &&
    !Array.isArray(overrideValue)
  ) {
    return { ...cloneValue(baseValue), ...cloneValue(overrideValue) };
  }

  return cloneValue(overrideValue);
}

function mergeTheme(baseTheme, overrideTheme) {
  const merged = {
    ...cloneValue(baseTheme),
    ...cloneValue(overrideTheme),
  };

  merged.colors = mergeMaybe(baseTheme.colors ?? {}, overrideTheme.colors ?? {});
  merged.tokenColors = mergeMaybe(baseTheme.tokenColors ?? [], overrideTheme.tokenColors ?? []);
  merged.semanticTokenColors = mergeMaybe(
    baseTheme.semanticTokenColors ?? {},
    overrideTheme.semanticTokenColors ?? {},
  );

  delete merged.include;
  return merged;
}

function resolveTheme(filePath, stack = []) {
  const normalizedPath = path.resolve(filePath);
  const theme = parseJsoncFile(normalizedPath);

  if (!theme.include) {
    return theme;
  }

  if (stack.includes(normalizedPath)) {
    throw new Error(`cyclic theme include detected: ${[...stack, normalizedPath].join(' -> ')}`);
  }

  const basePath = path.resolve(path.dirname(normalizedPath), theme.include);
  const resolvedBase = resolveTheme(basePath, [...stack, normalizedPath]);
  return mergeTheme(resolvedBase, theme);
}

function themeAppearance(sourceTheme, fileName) {
  if (sourceTheme.type === 'light' || sourceTheme.type === 'dark') {
    return sourceTheme.type;
  }

  return fileName.toLowerCase().includes('light') ? 'light' : 'dark';
}

function outputFileName(fileName) {
  return fileName;
}

function prepareMinimalZedWorkspace() {
  const cargoTomlPath = path.join(zedDir, 'Cargo.toml');
  const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  const workspacePackageIndex = cargoToml.indexOf('[workspace.package]');

  if (workspacePackageIndex === -1) {
    throw new Error('could not find [workspace.package] in Zed Cargo.toml');
  }

  const minimalWorkspaceHeader = [
    '[workspace]',
    'resolver = "2"',
    'members = [',
    ...zedWorkspaceMembers.map((member) => `    "${member}",`),
    ']',
    'default-members = ["crates/theme_importer"]',
    '',
  ].join('\n');

  fs.writeFileSync(cargoTomlPath, `${minimalWorkspaceHeader}${cargoToml.slice(workspacePackageIndex)}`);
}

function buildTheme(fileName) {
  const sourcePath = path.join(sourceThemesDir, fileName);
  const flattenedPath = path.join(flattenedDir, fileName);
  const importedPath = path.join(importedDir, fileName);
  const outputPath = path.join(outputDir, outputFileName(fileName));

  const resolvedTheme = resolveTheme(sourcePath);
  const appearance = themeAppearance(resolvedTheme, fileName);

  fs.writeFileSync(flattenedPath, `${JSON.stringify(resolvedTheme, null, 2)}\n`);

  log(`importing ${fileName}`);
  run(
    'cargo',
    ['run', '-q', '-p', 'theme_importer', '--', flattenedPath, '--output', importedPath],
    {
      cwd: zedDir,
      env: {
        ...process.env,
        CARGO_TARGET_DIR: cargoTargetDir,
      },
    },
  );

  const importedTheme = JSON.parse(fs.readFileSync(importedPath, 'utf8'));
  delete importedTheme.$schema;
  importedTheme.appearance = appearance;

  const family = {
    $schema: 'https://zed.dev/schema/themes/v0.2.0.json',
    name: importedTheme.name,
    author: 'Microsoft',
    themes: [importedTheme],
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(family, null, 2)}\n`);
}

function clearGeneratedJson(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.json')) {
      fs.rmSync(path.join(dir, file));
    }
  }
}

function main() {
  ensureDir(cacheDir);
  ensureDir(flattenedDir);
  ensureDir(importedDir);
  ensureDir(outputDir);

  clearGeneratedJson(flattenedDir);
  clearGeneratedJson(importedDir);
  clearGeneratedJson(outputDir);

  ensureGitRepo(vscodeDir, 'https://github.com/microsoft/vscode.git', {
    sparsePaths: ['extensions/theme-defaults/themes'],
  });
  ensureGitRepo(zedDir, 'https://github.com/zed-industries/zed.git', {
    sparsePaths: zedSparsePaths,
  });
  prepareMinimalZedWorkspace();

  const files = fs
    .readdirSync(sourceThemesDir)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    buildTheme(file);
  }

  log(`wrote ${files.length} theme files to ${path.relative(root, outputDir)}`);
}

main();
