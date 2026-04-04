# Changelog

## [0.4.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.3.0...vscode-function-starlark-v0.4.0) (2026-04-04)


### Features

* **quick-1:** extract LSP diagnostic noise filter and add "only file URIs" pattern ([31f1a51](https://github.com/Wompipomp/function-starlark-vscode/commit/31f1a514e6c28a6b423abdbd89744ef732e67e2a))
* **quick-2:** strip oci:// prefix in parseLoadStatements ([c12c30d](https://github.com/Wompipomp/function-starlark-vscode/commit/c12c30dfe86cb98480a7505492b5de56b3cb009f))
* **quick-3:** add ACR OAuth2 token exchange and access_token handling ([438d986](https://github.com/Wompipomp/function-starlark-vscode/commit/438d9865cddea6dc3ddc7304781155a2349e539a))
* **quick-3:** add identityToken support to Docker credential resolution ([e74895b](https://github.com/Wompipomp/function-starlark-vscode/commit/e74895b761ca0aafedc3b0c9d91979226bfc74c2))

## [0.3.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.2.0...vscode-function-starlark-v0.3.0) (2026-03-22)


### Features

* **01-01:** add VSCode development tooling ([099dfe7](https://github.com/Wompipomp/function-starlark-vscode/commit/099dfe731e83156efc3886bf5f2daf0dd54e5528))
* **01-01:** create esbuild build pipeline and project configuration ([985f2e7](https://github.com/Wompipomp/function-starlark-vscode/commit/985f2e7acb1d4fc38fe764ff1dad0a27e4f29d09))
* **01-02:** add TextMate grammar, icon, attribution, and language config ([9fe192b](https://github.com/Wompipomp/function-starlark-vscode/commit/9fe192b61d748f0063e6b54a23ec353f30f12ce0))
* **02-01:** rewrite extension.ts with full LSP client orchestration ([26aa0af](https://github.com/Wompipomp/function-starlark-vscode/commit/26aa0af7b50d8d388bc913d91718c67067837252))
* **03-01:** create BuildifierFormatProvider and add buildifier settings ([445918c](https://github.com/Wompipomp/function-starlark-vscode/commit/445918c0ca6f505402a61755ab5d66278cfae344))
* **03-01:** register BuildifierFormatProvider in extension activate ([11aa328](https://github.com/Wompipomp/function-starlark-vscode/commit/11aa328d3d4e86146350f8d32f2cf2dc29edf968))
* **04-01:** add schema() and field() builtins and schemas.path setting ([9a1b64a](https://github.com/Wompipomp/function-starlark-vscode/commit/9a1b64aa52ec95890d57e124b3690045155b073b))
* **04-01:** extend vscode mock with schema test infrastructure ([61af4e0](https://github.com/Wompipomp/function-starlark-vscode/commit/61af4e00629550ecfcc47f5abba3314a75f42f15))
* **04-02:** FileSystemWatcher with debounce and schemas.path config handling ([c6e3b75](https://github.com/Wompipomp/function-starlark-vscode/commit/c6e3b757f2d0ccde86cf6d7f61bf633b3908fd15))
* **04-02:** schema cache path resolution and dual --builtin-paths ([1bf5c47](https://github.com/Wompipomp/function-starlark-vscode/commit/1bf5c4768b8d784433cc1daa9d27c16cfd6788f4))
* **05-01:** implement Docker credential helper and Www-Authenticate parser ([45b21b3](https://github.com/Wompipomp/function-starlark-vscode/commit/45b21b3ac90c382a25fe8932ab63d8ccc7ee83d4))
* **05-01:** implement load statement parser with OCI path validation ([469decf](https://github.com/Wompipomp/function-starlark-vscode/commit/469decf04bd53ec042b5f8aa6fef7257cce56b64))
* **05-02:** implement OCI Distribution API client with token auth ([80a4b12](https://github.com/Wompipomp/function-starlark-vscode/commit/80a4b129dabb12204faefd4d359d97862ccfc56a))
* **05-02:** implement OCI download orchestrator with cache, extraction, dedup ([1f343ce](https://github.com/Wompipomp/function-starlark-vscode/commit/1f343ce14bdbaf46b156d94e3f36f537686f0f06))
* **05-03:** implement schema symbol index ([f3e0825](https://github.com/Wompipomp/function-starlark-vscode/commit/f3e0825dc773e5d9f4c69eae71110a6fae71a6b2))
* **05-03:** implement scoping middleware for per-file IntelliSense ([583cdf4](https://github.com/Wompipomp/function-starlark-vscode/commit/583cdf46d5d0b16bc8bd2f2e3ad1d88f5dd88063))
* **05-04:** implement missing-import diagnostics with quick-fix code actions ([933eb10](https://github.com/Wompipomp/function-starlark-vscode/commit/933eb10aaf0102f405e684628d59fa2e5f9f957d))
* **05-04:** wire Phase 5 modules into extension with settings and integration tests ([b68529b](https://github.com/Wompipomp/function-starlark-vscode/commit/b68529b5945f9b914232f2b9e6fc66c59dc6ba75))
* **05-05:** fix star import expansion in diagnostics with full cache path ([eade542](https://github.com/Wompipomp/function-starlark-vscode/commit/eade54260ce497e6089781fc3fcb4f0308f68abf))
* **05-05:** fix star import path key mismatch in middleware ([9b34442](https://github.com/Wompipomp/function-starlark-vscode/commit/9b344422a369da42c8d270063299a1bf3fb88bf9))
* **06-01:** implement schema subsystem lifecycle, startLsp gating, and showOutput command ([229eff1](https://github.com/Wompipomp/function-starlark-vscode/commit/229eff1648409c1d741289d0837d2a8dd045e43c))
* **07-01:** implement debounced config refresh with generation counter ([4f1ea10](https://github.com/Wompipomp/function-starlark-vscode/commit/4f1ea108ff36fbbbaa6f454ca2fec4bb8457b13e))
* **08-01:** extend SchemaIndex with metadata storage for type checking ([a5d1081](https://github.com/Wompipomp/function-starlark-vscode/commit/a5d108129f8db6281b072047d7bdb880e7fb64bc))
* **08-01:** implement missing-field detection in type checker ([ccadb1a](https://github.com/Wompipomp/function-starlark-vscode/commit/ccadb1a5432d2d0e08a7abb5357c46d6c2e06177))
* **08-01:** implement type-mismatch and unknown-field detection ([0d8a6c6](https://github.com/Wompipomp/function-starlark-vscode/commit/0d8a6c6a480e4ccd5beb7ec9901c23693bc689d3))
* **08-02:** implement TypeWarningProvider and wire into schema subsystem ([aee81a8](https://github.com/Wompipomp/function-starlark-vscode/commit/aee81a80f27a55f580c93d29e57b297cb5f4c3cb))
* **09-01:** implement MissingFieldQuickFixProvider with typed snippet placeholders ([6837bda](https://github.com/Wompipomp/function-starlark-vscode/commit/6837bdaf5a147364813513a3309ce917a05c72f2))
* **09-01:** wire MissingFieldQuickFixProvider into extension lifecycle ([ba08101](https://github.com/Wompipomp/function-starlark-vscode/commit/ba0810162d4848c912ccdce693394934dc3eda6b))
* add namespace import support for schema load statements ([5339247](https://github.com/Wompipomp/function-starlark-vscode/commit/533924767708d8b7c5462473773fb02ffff5fbb7))
* fix OCI schema IntelliSense with stub generation and full registry path support ([e15323c](https://github.com/Wompipomp/function-starlark-vscode/commit/e15323c298268059c43d5f88c19921f672c9e545))


### Bug Fixes

* **02-02:** use builtins.py file path instead of directory for --builtin-paths ([6e073d2](https://github.com/Wompipomp/function-starlark-vscode/commit/6e073d2a491ea17be71134588ff7b221a7b45da0))
* allow namespace member completions through middleware filter ([7fedfaf](https://github.com/Wompipomp/function-starlark-vscode/commit/7fedfafd05d2844af952a2ddb92ba1b06a9990b3))
* bump esbuild to ^0.27.0 to satisfy vite peer dependency ([d8b1474](https://github.com/Wompipomp/function-starlark-vscode/commit/d8b1474547a424dd7c3c3385fd5e6495a5bb4098))
* inline esbuild-watch problem matcher and add LICENSE ([30d39a8](https://github.com/Wompipomp/function-starlark-vscode/commit/30d39a8089d7a8e459681bc58633bd09074ed9ee))
* regenerate package-lock.json with Node 20 for CI compatibility ([ee69ef2](https://github.com/Wompipomp/function-starlark-vscode/commit/ee69ef22db6ec6d6b37dc9f56ee74fcc506031ef))
* resolve 5 pre-release issues for v1.8 milestone ([d9244f4](https://github.com/Wompipomp/function-starlark-vscode/commit/d9244f445822008438b51776a263d71908d2987c))
* use __init__.py for starlark-lsp directory-mode builtin loading ([9408818](https://github.com/Wompipomp/function-starlark-vscode/commit/940881874e6bffc02bd6c0c4e21ab6e81efde3ec))
* work around starlark-lsp selectionRange exceeding fullRange ([68353dd](https://github.com/Wompipomp/function-starlark-vscode/commit/68353ddd166be09d42dc8334e9b968103325c759))

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
