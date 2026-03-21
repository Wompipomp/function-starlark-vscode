# Roadmap: vscode-function-starlark

## Overview

This roadmap delivers a VSCode extension for function-starlark composition authoring in four phases. Phase 1 establishes the build pipeline and syntax highlighting -- a working, installable extension with zero runtime dependencies. Phase 2 adds the core value proposition: LSP-powered autocomplete, hover docs, and signature help for all function-starlark builtins. Phase 3 layers on buildifier format-on-save as an independent, optional feature. Phase 4 adds schema IntelliSense for typed constructor completions, blocked on upstream dependencies (function-starlark v1.7 + starlark-gen) and split into two sub-phases: 4a (LSP restart with schema paths) and 4b (per-file load-aware middleware). Phase 5 adds automatic OCI artifact download and per-file load() scoping for schema completions.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Syntax highlighting, build pipeline, and .vsix packaging
- [x] **Phase 2: LSP Core** - Builtin autocomplete, hover docs, signature help, and error handling (completed 2026-03-21)
- [x] **Phase 3: Buildifier** - Format-on-save integration with buildifier (completed 2026-03-21)
- [ ] **Phase 4: Schema IntelliSense** - Typed autocomplete for schema constructors from generated .star files
- [ ] **Phase 5: OCI Auto-Download & Load Scoping** - Automatic OCI schema download and per-file load() completion scoping

## Phase Details

### Phase 1: Foundation
**Goal**: User can install the extension and get syntax highlighting for all .star files with zero configuration
**Depends on**: Nothing (first phase)
**Requirements**: R1, R5
**Success Criteria** (what must be TRUE):
  1. Opening any `.star` file in VSCode shows syntax highlighting (keywords, strings, comments, functions, operators are distinctly colored)
  2. Bracket matching, auto-closing pairs, and comment toggling work correctly in `.star` files
  3. Running `vsce package` produces a `.vsix` file that installs successfully via `code --install-extension`
  4. The installed extension activates automatically when a `.star` file is opened (no manual activation needed)
  5. The `.vsix` package contains only the necessary files (dist/, starlark/, syntaxes/, language-configuration.json) and is under 1MB
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Build pipeline: esbuild, package.json scripts, .vscodeignore, ESLint, dev tooling
- [x] 01-02-PLAN.md -- Syntax highlighting: TextMate grammar, extension icon, Apache-2.0 attribution, packaging verification

**Research flags**: None. Fully documented by official VSCode extension samples (esbuild-sample). Grammar sourced directly from vscode-bazel.

---

### Phase 2: LSP Core
**Goal**: User gets autocomplete, hover docs, and signature help for all 13 function-starlark builtins and 6 predeclared variables immediately upon opening a .star file
**Depends on**: Phase 1
**Requirements**: R2, R3, R4
**Success Criteria** (what must be TRUE):
  1. Typing a builtin function name (e.g., `Res`) triggers autocomplete showing `Resource` with its full parameter list
  2. Hovering over any of the 13 builtin functions shows its docstring with parameter descriptions
  3. Hovering over any of the 6 predeclared variables (`oxr`, `dxr`, `observed`, `context`, `environment`, `extra_resources`) shows its docstring
  4. Typing inside a function call (e.g., `Resource(`) shows signature help with parameter names, defaults, and active parameter highlighting
  5. When `starlark-lsp` is not installed, user sees an actionable notification with "Install" and "Configure Path" buttons, and syntax highlighting continues working
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- LSP client integration: extension.ts rewrite with binary pre-check, status bar, error handler, restart command, config watcher; package.json commands and settings; builtins.py version tag
- [x] 02-02-PLAN.md -- End-to-end verification: automated pre-flight checks, manual testing of all 19 symbols, status bar, restart, config changes

**Research flags**: None. Direct analog exists in vscode-tilt. LanguageClient configuration verified from source. Error handling patterns established across rust-analyzer, gopls, and vscode-tilt.

**Pitfalls to address:**
- Pitfall #1: Binary not found at runtime -- implement `which`/`where` pre-check before spawning
- Pitfall #4: Variable docstrings must be string literals after assignment, not `# comment` style -- audit builtins.py

---

### Phase 3: Buildifier
**Goal**: User can format .star files on save using buildifier with zero configuration beyond having buildifier installed
**Depends on**: Phase 2
**Requirements**: R6
**Success Criteria** (what must be TRUE):
  1. With buildifier installed, saving a `.star` file auto-formats it (indentation, spacing, trailing commas)
  2. The buildifier binary path is configurable via `functionStarlark.buildifier.path` setting
  3. When buildifier is not installed, saving works normally with no error notification (silent degradation)
  4. Enabling `functionStarlark.buildifier.fixLintOnFormat` applies lint fixes during format-on-save
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md -- BuildifierFormatProvider with stdin/stdout formatting, package.json settings and configurationDefaults, formatter registration in activate()

**Research flags**: None. Reference implementation exists in vscode-bazel source code. stdin/stdout pattern is straightforward.

---

### Phase 4: Schema IntelliSense
**Goal**: User gets autocomplete, hover docs, and signature help for schema() and field() builtins, plus IntelliSense for schema constructors loaded from .py files in a local cache directory

**This phase is blocked on upstream dependencies:** function-starlark v1.7 (schema runtime) and starlark-gen (CLI producing .py schema files). Do not begin until starlark-gen produces stable schema files.

**Depends on**: Phase 2 (LSP restart mechanism), upstream deps
**Requirements**: R7 (R7.1, R7.2, R7.3, R7.4, R7.5, R7.6)
**Success Criteria** (what must be TRUE):
  1. With schema .py files in the cache directory, typing a schema constructor name triggers autocomplete showing the constructor with typed parameters
  2. Hovering over a schema constructor shows field descriptions, types, and required/optional status from the generated schema file
  3. Typing inside a schema constructor call shows signature help with parameter types and active parameter highlighting
  4. Adding/removing .py files from the schema cache triggers a debounced LSP restart
  5. Builtins autocomplete continues working without schemas configured (graceful degradation)

**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md -- Schema builtins (schema/field stubs in builtins.py), schemas.path setting, vscode mock extensions for testing
- [ ] 04-02-PLAN.md -- Schema cache integration: dual --builtin-paths in startLsp(), debounced FileSystemWatcher, schemas.path config change handling, unit tests

**Research flags:**
- starlark-lsp only processes .py files (not .star) -- schema cache must contain .py files
- Flat cache directory required (subdirectories cause module namespacing in starlark-lsp)
- globalStorageUri directory must be created with mkdirSync before passing to starlark-lsp

---

### Phase 5: OCI Auto-Download & Load Scoping
**Goal**: User gets automatic OCI schema artifact download when load() statements reference them, and completions/hover/signature help are scoped per-file based on what each file actually imports
**Depends on**: Phase 4
**Requirements**: R7.1, R7.2, R7.3, R7.4, R7.6
**Success Criteria** (what must be TRUE):
  1. Opening a .star file with `load("schemas-k8s:v1.31/apps/v1.star", "Deployment")` auto-downloads the OCI artifact if not cached
  2. Completions show only explicitly imported symbols + builtins (not all globally loaded schemas)
  3. Star imports (`load("...", "*")`) allow all symbols from the referenced file
  4. Hover and signature help respect the same per-file scoping rules
  5. Missing import diagnostics with quick-fix code actions help users add forgotten load() statements
  6. "Clear Schema Cache" command provides escape hatch for corrupted cache
  7. Extension degrades gracefully when schemas.enabled is false or downloads fail

**Plans**: 4 plans

Plans:
- [ ] 05-01-PLAN.md -- Load statement parser with OCI path validation/resolution, Docker credential helper integration
- [ ] 05-02-PLAN.md -- OCI Distribution API client with token auth, download orchestrator with cache/extraction/dedup
- [ ] 05-03-PLAN.md -- Schema symbol index from cached files, LanguageClient middleware for per-file completion/hover/signatureHelp filtering
- [ ] 05-04-PLAN.md -- Missing-import diagnostics with quick-fix, extension wiring, package.json settings/commands

**Research flags:**
- OCI Distribution Spec: Two HTTP calls (manifest + blob) with Bearer token auth challenge-response
- nanotar (zero deps, 2KB) for tar extraction -- not node-tar or tar-stream
- Raw HTTP fetch() instead of npm OCI packages (oci-client lacks credential helpers, oci-registry-client deprecated)
- Docker credential helper protocol for private registry auth
- starlark-lsp .star file support in --builtin-paths needs runtime verification (may need .py rename workaround)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-03-21 |
| 2. LSP Core | 2/2 | Complete   | 2026-03-21 |
| 3. Buildifier | 1/1 | Complete | 2026-03-21 |
| 4. Schema IntelliSense | 0/2 | Not started | - |
| 5. OCI Auto-Download & Load Scoping | 0/4 | Not started | - |
