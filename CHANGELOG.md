# Changelog

## [0.3.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.2.0...vscode-function-starlark-v0.3.0) (2026-03-22)


### Features

* **04-01:** add schema() and field() builtins and schemas.path setting ([a11467a](https://github.com/Wompipomp/function-starlark-vscode/commit/a11467a9656581f548fa2aa655d6daa130983399))
* **04-01:** extend vscode mock with schema test infrastructure ([cfe1746](https://github.com/Wompipomp/function-starlark-vscode/commit/cfe17464b7166bf0f312ad380383f0ee25816410))
* **04-02:** FileSystemWatcher with debounce and schemas.path config handling ([9696650](https://github.com/Wompipomp/function-starlark-vscode/commit/96966501eec7d0c0d44861a45e213de2281a54c2))
* **04-02:** schema cache path resolution and dual --builtin-paths ([f872552](https://github.com/Wompipomp/function-starlark-vscode/commit/f8725522b9c33fe46a091c91bb92900cdad9f205))
* **05-01:** implement Docker credential helper and Www-Authenticate parser ([5d7a0c6](https://github.com/Wompipomp/function-starlark-vscode/commit/5d7a0c62a793d28e5dc8ec8f0d5e9aec26c3c994))
* **05-01:** implement load statement parser with OCI path validation ([74f9c4b](https://github.com/Wompipomp/function-starlark-vscode/commit/74f9c4b2c09ed6b7bf8dd4770d6544426d7f5ee9))
* **05-02:** implement OCI Distribution API client with token auth ([5b16774](https://github.com/Wompipomp/function-starlark-vscode/commit/5b1677452808a5ed6dcfa5d1fdb91921a2c56137))
* **05-02:** implement OCI download orchestrator with cache, extraction, dedup ([78c4c8a](https://github.com/Wompipomp/function-starlark-vscode/commit/78c4c8a31c81e0c9cb0d1f88d6bce54f05256994))
* **05-03:** implement schema symbol index ([b92aa0d](https://github.com/Wompipomp/function-starlark-vscode/commit/b92aa0d6c0da29dd79240842ca3906d81bb52356))
* **05-03:** implement scoping middleware for per-file IntelliSense ([4cdf4ab](https://github.com/Wompipomp/function-starlark-vscode/commit/4cdf4ab5f4bc11aa54666525ad66f22adbc51e56))
* **05-04:** implement missing-import diagnostics with quick-fix code actions ([9535871](https://github.com/Wompipomp/function-starlark-vscode/commit/95358717495c4fa64d762fa6a5790ea1a949639e))
* **05-04:** wire Phase 5 modules into extension with settings and integration tests ([3d55c21](https://github.com/Wompipomp/function-starlark-vscode/commit/3d55c219f45003f6767507ed88832a081647b005))
* **05-05:** fix star import expansion in diagnostics with full cache path ([79636fd](https://github.com/Wompipomp/function-starlark-vscode/commit/79636fd94401354d2734605955b6dd4835477f2e))
* **05-05:** fix star import path key mismatch in middleware ([843b1c4](https://github.com/Wompipomp/function-starlark-vscode/commit/843b1c401c460b421bf8f1323f01146cfb3c15a3))
* **06-01:** implement schema subsystem lifecycle, startLsp gating, and showOutput command ([fc4b8ec](https://github.com/Wompipomp/function-starlark-vscode/commit/fc4b8ec820d8b835b2fd6e516653f93e2b71e415))
* add namespace import support for schema load statements ([3f47d16](https://github.com/Wompipomp/function-starlark-vscode/commit/3f47d16fe4caca92881c94eddcb28647642ea7ce))
* fix OCI schema IntelliSense with stub generation and full registry path support ([cabb0fe](https://github.com/Wompipomp/function-starlark-vscode/commit/cabb0fe1bf0bb08f52df190ef3e5e254a8991f83))


### Bug Fixes

* allow namespace member completions through middleware filter ([94d3c1f](https://github.com/Wompipomp/function-starlark-vscode/commit/94d3c1fc4a6ff9042751cac18399b10811c28e13))
* use __init__.py for starlark-lsp directory-mode builtin loading ([c494d2d](https://github.com/Wompipomp/function-starlark-vscode/commit/c494d2d524a78b2fa04b97307f9db567d7e8a8bb))
* work around starlark-lsp selectionRange exceeding fullRange ([4d82881](https://github.com/Wompipomp/function-starlark-vscode/commit/4d82881c47e077a7a2589708403a53afc9d86d66))

## [0.2.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.1.0...vscode-function-starlark-v0.2.0) (2026-03-21)


### Features

* **01-01:** add VSCode development tooling ([099dfe7](https://github.com/Wompipomp/function-starlark-vscode/commit/099dfe731e83156efc3886bf5f2daf0dd54e5528))
* **01-01:** create esbuild build pipeline and project configuration ([985f2e7](https://github.com/Wompipomp/function-starlark-vscode/commit/985f2e7acb1d4fc38fe764ff1dad0a27e4f29d09))
* **01-02:** add TextMate grammar, icon, attribution, and language config ([9fe192b](https://github.com/Wompipomp/function-starlark-vscode/commit/9fe192b61d748f0063e6b54a23ec353f30f12ce0))
* **02-01:** rewrite extension.ts with full LSP client orchestration ([26aa0af](https://github.com/Wompipomp/function-starlark-vscode/commit/26aa0af7b50d8d388bc913d91718c67067837252))
* **03-01:** create BuildifierFormatProvider and add buildifier settings ([445918c](https://github.com/Wompipomp/function-starlark-vscode/commit/445918c0ca6f505402a61755ab5d66278cfae344))
* **03-01:** register BuildifierFormatProvider in extension activate ([11aa328](https://github.com/Wompipomp/function-starlark-vscode/commit/11aa328d3d4e86146350f8d32f2cf2dc29edf968))


### Bug Fixes

* **02-02:** use builtins.py file path instead of directory for --builtin-paths ([6e073d2](https://github.com/Wompipomp/function-starlark-vscode/commit/6e073d2a491ea17be71134588ff7b221a7b45da0))
* inline esbuild-watch problem matcher and add LICENSE ([30d39a8](https://github.com/Wompipomp/function-starlark-vscode/commit/30d39a8089d7a8e459681bc58633bd09074ed9ee))
* regenerate package-lock.json with Node 20 for CI compatibility ([321ca17](https://github.com/Wompipomp/function-starlark-vscode/commit/321ca17d949932362ac0eb754e2c2d785d88dc2a))
