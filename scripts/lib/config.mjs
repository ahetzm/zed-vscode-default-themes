import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const root = path.resolve(__dirname, "../..");
export const cacheDir = path.join(root, ".cache");
export const vscodeDir = path.join(cacheDir, "vscode");
export const zedDir = path.join(cacheDir, "zed");
export const flattenedDir = path.join(cacheDir, "flattened");
export const importedDir = path.join(cacheDir, "imported");
export const cargoTargetDir = path.join(cacheDir, "cargo-target");
export const outputDir = path.join(root, "themes");
export const sourceThemesDir = path.join(
	vscodeDir,
	"extensions",
	"theme-defaults",
	"themes",
);
export const refresh = process.argv.includes("--refresh");

export const zedWorkspaceMembers = [
	"crates/askpass",
	"crates/clock",
	"crates/cloud_llm_client",
	"crates/collections",
	"crates/fs",
	"crates/git",
	"crates/gpui",
	"crates/gpui_linux",
	"crates/gpui_macos",
	"crates/gpui_macros",
	"crates/gpui_platform",
	"crates/gpui_shared_string",
	"crates/gpui_util",
	"crates/gpui_web",
	"crates/gpui_wgpu",
	"crates/gpui_windows",
	"crates/http_client",
	"crates/http_client_tls",
	"crates/language_model_core",
	"crates/media",
	"crates/migrator",
	"crates/net",
	"crates/paths",
	"crates/proto",
	"crates/refineable",
	"crates/refineable/derive_refineable",
	"crates/release_channel",
	"crates/reqwest_client",
	"crates/rope",
	"crates/scheduler",
	"crates/settings",
	"crates/settings_content",
	"crates/settings_json",
	"crates/settings_macros",
	"crates/sum_tree",
	"crates/syntax_theme",
	"crates/telemetry",
	"crates/telemetry_events",
	"crates/text",
	"crates/theme",
	"crates/theme_importer",
	"crates/theme_settings",
	"crates/util",
	"crates/util_macros",
	"crates/zeta_prompt",
	"crates/zlog",
	"crates/ztracing",
	"crates/ztracing_macro",
	"tooling/perf",
];

export const zedSparsePaths = [
	"Cargo.toml",
	"Cargo.lock",
	"assets/settings",
	"assets/keymaps",
	"crates/zed/RELEASE_CHANNEL",
	...zedWorkspaceMembers,
];
