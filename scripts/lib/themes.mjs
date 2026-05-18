import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import {
	cargoTargetDir,
	flattenedDir,
	importedDir,
	outputDir,
	sourceThemesDir,
	zedDir,
	zedWorkspaceMembers,
} from "./config.mjs";
import { log, run } from "./utils.mjs";

function parseJsoncFile(filePath) {
	const source = fs.readFileSync(filePath, "utf8");
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
		typeof baseValue === "object" &&
		typeof overrideValue === "object" &&
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

	merged.colors = mergeMaybe(
		baseTheme.colors ?? {},
		overrideTheme.colors ?? {},
	);
	merged.tokenColors = mergeMaybe(
		baseTheme.tokenColors ?? [],
		overrideTheme.tokenColors ?? [],
	);
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
		throw new Error(
			`cyclic theme include detected: ${[...stack, normalizedPath].join(" -> ")}`,
		);
	}

	const basePath = path.resolve(path.dirname(normalizedPath), theme.include);
	const resolvedBase = resolveTheme(basePath, [...stack, normalizedPath]);
	return mergeTheme(resolvedBase, theme);
}

function themeAppearance(sourceTheme, fileName) {
	if (sourceTheme.type === "light" || sourceTheme.type === "dark") {
		return sourceTheme.type;
	}

	return fileName.toLowerCase().includes("light") ? "light" : "dark";
}

function outputFileName(fileName) {
	return fileName;
}

export function prepareMinimalZedWorkspace() {
	const cargoTomlPath = path.join(zedDir, "Cargo.toml");
	const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
	const workspacePackageIndex = cargoToml.indexOf("[workspace.package]");

	if (workspacePackageIndex === -1) {
		throw new Error("could not find [workspace.package] in Zed Cargo.toml");
	}

	const minimalWorkspaceHeader = [
		"[workspace]",
		'resolver = "2"',
		"members = [",
		...zedWorkspaceMembers.map((member) => `    "${member}",`),
		"]",
		'default-members = ["crates/theme_importer"]',
		"",
	].join("\n");

	fs.writeFileSync(
		cargoTomlPath,
		`${minimalWorkspaceHeader}${cargoToml.slice(workspacePackageIndex)}`,
	);
}

export function buildTheme(fileName) {
	const sourcePath = path.join(sourceThemesDir, fileName);
	const flattenedPath = path.join(flattenedDir, fileName);
	const importedPath = path.join(importedDir, fileName);
	const outputPath = path.join(outputDir, outputFileName(fileName));

	const resolvedTheme = resolveTheme(sourcePath);
	const appearance = themeAppearance(resolvedTheme, fileName);

	fs.writeFileSync(
		flattenedPath,
		`${JSON.stringify(resolvedTheme, null, 2)}\n`,
	);

	log(`importing ${fileName}`);
	run(
		"cargo",
		[
			"run",
			"-q",
			"-p",
			"theme_importer",
			"--",
			flattenedPath,
			"--output",
			importedPath,
		],
		{
			cwd: zedDir,
			env: {
				...process.env,
				CARGO_TARGET_DIR: cargoTargetDir,
			},
		},
	);

	const importedTheme = JSON.parse(fs.readFileSync(importedPath, "utf8"));
	delete importedTheme.$schema;
	importedTheme.appearance = appearance;

	const family = {
		$schema: "https://zed.dev/schema/themes/v0.2.0.json",
		name: importedTheme.name,
		author: "Microsoft",
		themes: [importedTheme],
	};

	fs.writeFileSync(outputPath, `${JSON.stringify(family, null, 2)}\n`);
}

export function listSourceThemeFiles() {
	return fs
		.readdirSync(sourceThemesDir)
		.filter((file) => file.endsWith(".json"))
		.sort((a, b) => a.localeCompare(b));
}
