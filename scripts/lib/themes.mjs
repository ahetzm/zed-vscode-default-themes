import { spawnSync } from "node:child_process";
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
import { log } from "./utils.mjs";

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

function tokenScopes(tokenColor) {
	const scope = tokenColor?.scope;
	const scopes = Array.isArray(scope)
		? scope
		: typeof scope === "string"
			? [scope]
			: [];

	return scopes.flatMap((scope) =>
		scope
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
	);
}

function findTokenColor(tokenColors, scopes) {
	const targetScopes = new Set(scopes);

	for (let index = tokenColors.length - 1; index >= 0; index -= 1) {
		const tokenColor = tokenColors[index];
		const settings = tokenColor?.settings;

		if (!settings?.foreground && !settings?.background && !settings?.fontStyle) {
			continue;
		}

		if (tokenScopes(tokenColor).some((scope) => targetScopes.has(scope))) {
			return tokenColor;
		}
	}

	return null;
}

function highlightStyleFromTokenColor(tokenColor) {
	const settings = tokenColor?.settings ?? {};
	const style = {};

	if (settings.foreground) {
		style.color = settings.foreground;
	}

	if (settings.background) {
		style.background_color = settings.background;
	}

	if (settings.fontStyle?.includes("italic")) {
		style.font_style = "italic";
	} else if (settings.fontStyle?.includes("oblique")) {
		style.font_style = "oblique";
	}

	if (settings.fontStyle?.includes("bold")) {
		style.font_weight = 700;
	}

	return Object.keys(style).length > 0 ? style : null;
}

function setSyntaxFromScopes(importedTheme, resolvedTheme, syntaxName, scopes) {
	const tokenColor = findTokenColor(resolvedTheme.tokenColors ?? [], scopes);
	const style = highlightStyleFromTokenColor(tokenColor);

	if (!style) {
		return;
	}

	importedTheme.style.syntax ??= {};
	importedTheme.style.syntax[syntaxName] = style;
}

function copySyntax(importedTheme, sourceName, targetName) {
	const source = importedTheme.style.syntax?.[sourceName];

	if (!source) {
		return;
	}

	importedTheme.style.syntax ??= {};
	importedTheme.style.syntax[targetName] ??= cloneValue(source);
}

function improveSyntaxFidelity(importedTheme, resolvedTheme) {
	setSyntaxFromScopes(importedTheme, resolvedTheme, "constructor", [
		"support.class.component",
		"support.class",
		"entity.name.class",
		"entity.name.type",
	]);
	setSyntaxFromScopes(importedTheme, resolvedTheme, "string.escape", [
		"constant.character.escape",
	]);
	setSyntaxFromScopes(importedTheme, resolvedTheme, "string.regex", [
		"string.regexp",
		"source.regexp",
		"string.regex",
	]);
	setSyntaxFromScopes(importedTheme, resolvedTheme, "variant", [
		"variable.other.enummember",
	]);
	setSyntaxFromScopes(importedTheme, resolvedTheme, "type.enum.member", [
		"variable.other.enummember",
	]);
	setSyntaxFromScopes(importedTheme, resolvedTheme, "enum", ["support.type.enum"]);
	setSyntaxFromScopes(importedTheme, resolvedTheme, "type.enum", [
		"support.type.enum",
	]);
	copySyntax(importedTheme, "type", "enum");
	copySyntax(importedTheme, "type", "type.enum");
}

function writeOutput(output, stream) {
	if (output) {
		stream.write(output);
	}
}

function filterImporterStderr(stderr) {
	return stderr
		.split(/(\r?\n)/)
		.reduce((filtered, part, index, parts) => {
			if (index % 2 === 1) {
				return filtered;
			}

			const lineEnding = parts[index + 1] ?? "";

			if (
				part.includes("No matching token color found for") ||
				part.includes("[INFO]")
			) {
				return filtered;
			}

			return `${filtered}${part}${lineEnding}`;
		}, "");
}

function runThemeImporter(args, options) {
	const result = spawnSync("cargo", args, {
		encoding: "utf8",
		maxBuffer: 100 * 1024 * 1024,
		...options,
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		writeOutput(result.stdout, process.stdout);
		writeOutput(result.stderr, process.stderr);
		throw new Error(`theme importer failed with exit code ${result.status}`);
	}

	writeOutput(result.stdout, process.stdout);
	writeOutput(filterImporterStderr(result.stderr ?? ""), process.stderr);
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
	runThemeImporter(
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
	improveSyntaxFidelity(importedTheme, resolvedTheme);

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
