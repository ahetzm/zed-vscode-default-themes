#!/usr/bin/env node

import path from "node:path";

import {
	cacheDir,
	flattenedDir,
	importedDir,
	outputDir,
	root,
	vscodeDir,
	zedDir,
	zedSparsePaths,
} from "./lib/config.mjs";
import {
	buildTheme,
	listSourceThemeFiles,
	prepareMinimalZedWorkspace,
} from "./lib/themes.mjs";
import {
	clearGeneratedJson,
	ensureDir,
	ensureGitRepo,
	log,
} from "./lib/utils.mjs";

function main() {
	ensureDir(cacheDir);
	ensureDir(flattenedDir);
	ensureDir(importedDir);
	ensureDir(outputDir);

	clearGeneratedJson(flattenedDir);
	clearGeneratedJson(importedDir);
	clearGeneratedJson(outputDir);

	ensureGitRepo(vscodeDir, "https://github.com/microsoft/vscode.git", {
		sparsePaths: ["extensions/theme-defaults/themes"],
	});
	ensureGitRepo(zedDir, "https://github.com/zed-industries/zed.git", {
		sparsePaths: zedSparsePaths,
	});
	prepareMinimalZedWorkspace();

	const files = listSourceThemeFiles();

	for (const file of files) {
		buildTheme(file);
	}

	log(`wrote ${files.length} theme files to ${path.relative(root, outputDir)}`);
}

main();
