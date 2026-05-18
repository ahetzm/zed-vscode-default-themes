import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { refresh } from "./config.mjs";

export function log(message) {
	console.log(`[build-themes] ${message}`);
}

export function run(command, args, options = {}) {
	execFileSync(command, args, {
		stdio: "inherit",
		...options,
	});
}

export function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

export function clearGeneratedJson(dir) {
	if (!fs.existsSync(dir)) {
		return;
	}

	for (const file of fs.readdirSync(dir)) {
		if (file.endsWith(".json")) {
			fs.rmSync(path.join(dir, file));
		}
	}
}

export function ensureGitRepo(dir, url, options = {}) {
	const { sparsePaths = [] } = options;

	if (!fs.existsSync(dir)) {
		ensureDir(path.dirname(dir));
		log(`cloning ${url}`);

		const cloneArgs = ["clone", "--depth", "1"];
		if (sparsePaths.length > 0) {
			cloneArgs.push("--filter=blob:none", "--sparse");
		}
		cloneArgs.push(url, dir);
		run("git", cloneArgs);

		if (sparsePaths.length > 0) {
			run("git", [
				"-C",
				dir,
				"sparse-checkout",
				"set",
				"--skip-checks",
				...sparsePaths,
			]);
		}

		return;
	}

	if (refresh) {
		log(`refreshing ${dir}`);
		run("git", ["-C", dir, "fetch", "--depth", "1", "origin", "main"]);
		run("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
		run("git", ["-C", dir, "clean", "-fd"]);
	}

	if (sparsePaths.length > 0) {
		run("git", [
			"-C",
			dir,
			"sparse-checkout",
			"set",
			"--skip-checks",
			...sparsePaths,
		]);
	}
}
