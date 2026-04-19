# Changelog

## [0.8.2](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.8.1...vscode-function-starlark-v0.8.2) (2026-04-19)


### Bug Fixes

* **quick-4:** resolve top-level assignments in load() go-to-def ([648a800](https://github.com/Wompipomp/function-starlark-vscode/commit/648a800398b602fdd6b107107b858d6a24890466))

## [0.8.1](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.8.0...vscode-function-starlark-v0.8.1) (2026-04-19)


### Bug Fixes

* **quick-4:** handle star imports in load() go-to-def ([1b84262](https://github.com/Wompipomp/function-starlark-vscode/commit/1b8426225534194aec00e3467b316111f8428175))
* **quick-4:** resolve load() go-to-def per-version to avoid cache collisions ([78bc7ed](https://github.com/Wompipomp/function-starlark-vscode/commit/78bc7edcb6b8dff132ce16b4d0783dd17cfc116c))

## [0.8.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.7.0...vscode-function-starlark-v0.8.0) (2026-04-19)


### Features

* **quick-4:** implement LoadDefinitionProvider for go-to-definition ([473ec2b](https://github.com/Wompipomp/function-starlark-vscode/commit/473ec2b3fa9186b5fc1ef1684c9c1af4b5e34fb5))
* **quick-4:** register LoadDefinitionProvider in extension activation ([ed7ba30](https://github.com/Wompipomp/function-starlark-vscode/commit/ed7ba3028ae2bb5d858913aa39fb9473cdabcec7))

## [0.7.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.6.0...vscode-function-starlark-v0.7.0) (2026-04-14)


### ⚠ BREAKING CHANGES

* none — re-releasing as minor for package build

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
* **10-01:** create directory-mode stub files for builtins and 6 modules ([df7cdc6](https://github.com/Wompipomp/function-starlark-vscode/commit/df7cdc689d9362f71c3810cd92e740d4a84ed1e2))
* **10-01:** wire directory mode and expand BUILTIN_NAMES to 34 entries ([34b7256](https://github.com/Wompipomp/function-starlark-vscode/commit/34b72560214eebf7e0182592bf4cb0f84bf9f2d9))
* **10-03:** add builtin module completion and hover pass-through ([714d4d2](https://github.com/Wompipomp/function-starlark-vscode/commit/714d4d2b4c188990ef73ed9defe083dd3a0453dd))
* **11-01:** add enum parsing and hover docs to schema-stubs ([85c9f70](https://github.com/Wompipomp/function-starlark-vscode/commit/85c9f704843a3656ada6d08e2489f4f9da6dc31e))
* **11-01:** add enum validation to type-checker ([13d9150](https://github.com/Wompipomp/function-starlark-vscode/commit/13d91507212c2986099e1dbc30a3a53ceb0b4edc))
* **11-02:** fix multi-line enum and single-quoted string parsing ([a16ae04](https://github.com/Wompipomp/function-starlark-vscode/commit/a16ae04deea7493ae9953ba8bc1dc3318ef73be1))
* **11-03:** add keyword-argument hover context detection ([44d6a02](https://github.com/Wompipomp/function-starlark-vscode/commit/44d6a0248cda717862d2b4b3892841f247a6b981))
* **12-01:** add line tracking to parseSchemas ([5e2ccb2](https://github.com/Wompipomp/function-starlark-vscode/commit/5e2ccb2dc9a85747a4d9173023ccd11af2c2f723))
* **12-01:** add schemaName/fieldName to DiagnosticDescriptor ([6653037](https://github.com/Wompipomp/function-starlark-vscode/commit/66530375a9722836c4fd7f71be9ede1afec6dc08))
* **12-02:** attach relatedInformation to schema diagnostics for clickable navigation ([7e49ce3](https://github.com/Wompipomp/function-starlark-vscode/commit/7e49ce3fc155a53dee044a3a390904ffcb70b309))
* add namespace import support for schema load statements ([5339247](https://github.com/Wompipomp/function-starlark-vscode/commit/533924767708d8b7c5462473773fb02ffff5fbb7))
* fix OCI schema IntelliSense with stub generation and full registry path support ([e15323c](https://github.com/Wompipomp/function-starlark-vscode/commit/e15323c298268059c43d5f88c19921f672c9e545))
* handle multi-line params in function stub generation ([c882d9e](https://github.com/Wompipomp/function-starlark-vscode/commit/c882d9e48599fd454748a8f90a0a5ca99cd5536d))
* OCI function stub generation for starlark-lsp ([a114b02](https://github.com/Wompipomp/function-starlark-vscode/commit/a114b02661f725ac3bb9e22458fde1a8f0481e0e))
* **quick-1:** extract LSP diagnostic noise filter and add "only file URIs" pattern ([4035202](https://github.com/Wompipomp/function-starlark-vscode/commit/4035202be7736a13d9b9dd9fece85500a4ae16bc))
* **quick-2:** strip oci:// prefix in parseLoadStatements ([d7d72ab](https://github.com/Wompipomp/function-starlark-vscode/commit/d7d72ab32663d83e82884253c31184e6025f817b))
* **quick-3:** add ACR OAuth2 token exchange and access_token handling ([d6d4502](https://github.com/Wompipomp/function-starlark-vscode/commit/d6d4502c2cb0f2127076e8b57d8f226bb541b452))
* **quick-3:** add identityToken support to Docker credential resolution ([4a2742f](https://github.com/Wompipomp/function-starlark-vscode/commit/4a2742f46b14465abe2f06bf4e747ba4d3953229))


### Bug Fixes

* **02-02:** use builtins.py file path instead of directory for --builtin-paths ([6e073d2](https://github.com/Wompipomp/function-starlark-vscode/commit/6e073d2a491ea17be71134588ff7b221a7b45da0))
* **10-02:** apply string/comment masking to missing-import diagnostics ([01b22f3](https://github.com/Wompipomp/function-starlark-vscode/commit/01b22f370ef3e9461e94f9fc40453ee5b2c7d0a9))
* **10-03:** fix builtin module completion, hover, and syntax highlighting ([aae1db4](https://github.com/Wompipomp/function-starlark-vscode/commit/aae1db4a58d152d0a37f2c367c2bc04c8b5254cc))
* **11:** support schema hover and diagnostics for locally-defined schemas ([e14dfb0](https://github.com/Wompipomp/function-starlark-vscode/commit/e14dfb09d1e23cf8e47f290335a232654c9e1c0a))
* **12:** parse user fields named 'name' or 'doc' in parseSchemas ([5499935](https://github.com/Wompipomp/function-starlark-vscode/commit/549993579fd2a5f28bf815d86f1efd3083f8cdcb))
* allow namespace member completions through middleware filter ([7fedfaf](https://github.com/Wompipomp/function-starlark-vscode/commit/7fedfafd05d2844af952a2ddb92ba1b06a9990b3))
* bump esbuild to ^0.27.0 to satisfy vite peer dependency ([d8b1474](https://github.com/Wompipomp/function-starlark-vscode/commit/d8b1474547a424dd7c3c3385fd5e6495a5bb4098))
* generate LSP stubs for def functions in OCI schema packages ([05663aa](https://github.com/Wompipomp/function-starlark-vscode/commit/05663aa816e9ef4c534d116da1b6f5a81ac081c8))
* inline esbuild-watch problem matcher and add LICENSE ([30d39a8](https://github.com/Wompipomp/function-starlark-vscode/commit/30d39a8089d7a8e459681bc58633bd09074ed9ee))
* regenerate package-lock.json with Node 20 for CI compatibility ([ee69ef2](https://github.com/Wompipomp/function-starlark-vscode/commit/ee69ef22db6ec6d6b37dc9f56ee74fcc506031ef))
* resolve 5 pre-release issues for v1.8 milestone ([d9244f4](https://github.com/Wompipomp/function-starlark-vscode/commit/d9244f445822008438b51776a263d71908d2987c))
* use __init__.py for starlark-lsp directory-mode builtin loading ([9408818](https://github.com/Wompipomp/function-starlark-vscode/commit/940881874e6bffc02bd6c0c4e21ab6e81efde3ec))
* work around starlark-lsp selectionRange exceeding fullRange ([68353dd](https://github.com/Wompipomp/function-starlark-vscode/commit/68353ddd166be09d42dc8334e9b968103325c759))

## [0.6.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.5.0...vscode-function-starlark-v0.6.0) (2026-04-05)


### Features

* handle multi-line params in function stub generation ([a1ca831](https://github.com/Wompipomp/function-starlark-vscode/commit/a1ca831bd40512c5a903a3cb8b1def27ec9169e5))

## [0.5.0](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.4.1...vscode-function-starlark-v0.5.0) (2026-04-04)


### ⚠ BREAKING CHANGES

* none — re-releasing as minor for package build

### Features

* OCI function stub generation for starlark-lsp ([6fdea81](https://github.com/Wompipomp/function-starlark-vscode/commit/6fdea81e8e6edaab3e6cf99c1a53f07893ae2ca4))

## [0.4.1](https://github.com/Wompipomp/function-starlark-vscode/compare/vscode-function-starlark-v0.4.0...vscode-function-starlark-v0.4.1) (2026-04-04)


### Bug Fixes

* generate LSP stubs for def functions in OCI schema packages ([76e0311](https://github.com/Wompipomp/function-starlark-vscode/commit/76e0311b0f11380fe97e16eba81109e211f8b178))

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
