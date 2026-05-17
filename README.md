# VSCode Default Themes for Zed

This Zed extension packages the default Microsoft VSCode themes from:

- https://github.com/microsoft/vscode/tree/main/extensions/theme-defaults/themes

## Build / refresh themes

```sh
node scripts/build-themes.mjs
```

To refresh the cached upstream repos first:

```sh
node scripts/build-themes.mjs --refresh
```

What the build does:

1. Sparse-checks out only `extensions/theme-defaults/themes` from `microsoft/vscode`
2. Sparse-checks out only the `theme_importer`-related subset of `zed-industries/zed`
3. Rewrites Zed's monorepo workspace locally into a minimal workspace for `theme_importer`
4. Resolves VSCode `include` chains into flattened JSON
5. Runs Zed's `theme_importer`
6. Fixes light/dark appearance metadata for light themes
7. Writes final Zed theme family files into `themes/`

## Install locally in Zed

In Zed:

1. Open the Extensions page
2. Choose **Install Dev Extension**
3. Select this repository

## Notes

- Zed's importer currently does not resolve VSCode `include` inheritance by itself, so this repo flattens those themes first.
- The importer currently emits `dark` appearance by default; the build script corrects light themes after conversion.
- The build intentionally avoids full upstream checkouts and only pulls the subset needed for conversion.
