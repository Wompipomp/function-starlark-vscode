---
phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense
plan: 03
subsystem: api
tags: [starlark, middleware, schema-index, vscode-languageclient, per-file-scoping]

# Dependency graph
requires:
  - phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense
    plan: 01
    provides: Load statement parser with OCI path validation and symbol extraction
provides:
  - Schema symbol index (BUILTIN_NAMES + per-file symbol extraction from cached .star files)
  - LanguageClient middleware hooks for per-file completion/hover/signatureHelp filtering
  - Document imports cache with update/clear lifecycle
affects: [05-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [Schema symbol indexing via regex, LanguageClient middleware filtering, Document-level imports caching]

key-files:
  created:
    - src/schema-index.ts
    - src/schema-index.test.ts
    - src/middleware.ts
    - src/middleware.test.ts
  modified: []

key-decisions:
  - "BUILTIN_NAMES is a static ReadonlySet of 21 names (15 functions + 6 variables) matching builtins.py"
  - "extractTopLevelDefs uses regex with /^/ multiline flag to only match top-level defs, ignoring indented/nested defs"
  - "Middleware uses document URI-keyed cache to avoid re-parsing load() on every completion/hover request"
  - "Star import expands to all symbols from the referenced file via SchemaIndex.getSymbolsForFile()"

patterns-established:
  - "Middleware pattern: call next() first, then filter results against allowed symbols set"
  - "getAllowedSymbols: builtins union with load()-imported symbols, cached per document URI"
  - "getDocumentText callback pattern for accessing fresh document text from extension context"

requirements-completed: [R7.1, R7.2, R7.3, R7.4]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 5 Plan 03: Schema Index & Scoping Middleware Summary

**Schema symbol index with per-file LanguageClient middleware filtering completions/hover to builtins + load()-imported symbols**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T19:18:10Z
- **Completed:** 2026-03-21T19:21:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- BUILTIN_NAMES set with all 21 function-starlark builtins for middleware pass-through
- SchemaIndex recursively scans cached .star files, extracting top-level def and schema() assignment names
- Middleware filters completions to only builtins + explicitly imported symbols per document
- Star imports ("*") expand to all symbols from the referenced .star file
- Hover suppressed for non-imported non-builtin symbols
- Both CompletionItem[] and CompletionList response formats handled correctly

## Task Commits

Each task was committed atomically (TDD red-green):

1. **Task 1: Schema symbol index** - `efd6e22` (test: failing tests) -> `b92aa0d` (feat: implementation)
2. **Task 2: Scoping middleware** - `426b6bb` (test: failing tests) -> `4cdf4ab` (feat: implementation)

_Note: TDD tasks each have two commits (test -> feat)_

## Files Created/Modified
- `src/schema-index.ts` - BUILTIN_NAMES constant, extractTopLevelDefs regex extractor, SchemaIndex class with buildFromCache/rebuild/getSymbolsForFile/getAllSymbols
- `src/schema-index.test.ts` - 14 unit tests covering builtins, def extraction, schema assignments, index build/lookup/rebuild
- `src/middleware.ts` - getAllowedSymbols, createScopingMiddleware (provideCompletionItem, provideHover, provideSignatureHelp), updateDocumentImports, clearDocumentImports
- `src/middleware.test.ts` - 14 unit tests covering symbol filtering, star imports, caching, CompletionList format, hover suppression, signatureHelp passthrough

## Decisions Made
- BUILTIN_NAMES is a static ReadonlySet matching all 21 names from builtins.py (no dynamic parsing of builtins.py at runtime)
- extractTopLevelDefs regex uses ^ with /m flag to only match top-level defs, naturally ignoring indented nested functions
- Middleware caches allowed symbols per document URI to avoid re-parsing load() statements on every completion/hover request
- Star import ("*") resolves to all symbols via SchemaIndex.getSymbolsForFile() using the tarEntryPath as lookup key

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SchemaIndex and middleware modules ready for Plan 04 to wire into LanguageClient activation
- createScopingMiddleware returns middleware object compatible with LanguageClientOptions.middleware
- updateDocumentImports/clearDocumentImports exported for document lifecycle management in extension.ts

## Self-Check: PASSED

All 4 created files verified on disk. All 4 task commits verified in git log.

---
*Phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense*
*Completed: 2026-03-21*
