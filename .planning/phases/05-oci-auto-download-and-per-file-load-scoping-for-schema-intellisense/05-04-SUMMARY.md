---
phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense
plan: 04
subsystem: extension
tags: [vscode, diagnostics, code-actions, oci, middleware, schema]

# Dependency graph
requires:
  - phase: 05-01
    provides: load-parser for extracting OCI refs from load() statements
  - phase: 05-02
    provides: OCI downloader for fetching schema artifacts
  - phase: 05-03
    provides: SchemaIndex and scoping middleware for per-file IntelliSense filtering
provides:
  - MissingImportDiagnosticProvider with quick-fix code actions
  - Full extension wiring of all Phase 5 modules
  - schemas.registry and schemas.enabled settings
  - Clear Schema Cache command
  - Document open/save/close handlers for OCI auto-download
  - Status bar download progress indication
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level state with schemas.enabled gate for conditional initialization"
    - "Middleware spread pattern for merging scoping hooks with existing provideDocumentSymbols"
    - "Reverse index in SchemaIndex for symbol-to-file lookup"

key-files:
  created:
    - src/diagnostics.ts
    - src/diagnostics.test.ts
  modified:
    - src/extension.ts
    - src/schema.test.ts
    - src/schema-index.ts
    - src/__mocks__/vscode.ts
    - package.json
    - src/oci/auth.ts

key-decisions:
  - "PascalCase regex for symbol detection avoids false positives on variable names"
  - "filePathToLoadPath converts cache-relative paths back to OCI load paths for quick-fix"
  - "Middleware spread with unknown cast bridges loose middleware types to strict vscode-languageclient Middleware type"
  - "getFileForSymbol reverse index built during walkDir for O(1) symbol-to-file lookup"

patterns-established:
  - "schemas.enabled gate: all schema features conditionally initialized based on setting"
  - "Diagnostic source tag for filtering provider-specific diagnostics in code actions"

requirements-completed: [R7.1, R7.2, R7.3, R7.4, R7.6]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 5 Plan 4: Extension Wiring and Missing-Import Diagnostics Summary

**Missing-import diagnostics with quick-fix code actions, full Phase 5 module wiring, OCI auto-download on document open/save, and new schemas.registry/enabled settings**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T19:25:27Z
- **Completed:** 2026-03-21T19:33:22Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- MissingImportDiagnosticProvider detects unimported PascalCase schema symbols with Hint severity diagnostics
- Quick-fix code actions insert appropriate load() statements after existing loads or at file top
- Extension activation wires load-parser, OCI downloader, SchemaIndex, scoping middleware, and diagnostics
- schemas.enabled and schemas.registry settings in package.json control feature activation
- Clear Schema Cache command deletes cache, rebuilds index, restarts LSP
- Document open/save handlers trigger OCI auto-download with status bar progress
- FileSystemWatcher extended to watch both .py and .star files in cache

## Task Commits

Each task was committed atomically:

1. **Task 1: Missing-import diagnostics with quick-fix code action (TDD)**
   - `440376a` (test: failing tests for diagnostics)
   - `9535871` (feat: diagnostics implementation + SchemaIndex reverse lookup)
2. **Task 2: Extension wiring, package.json settings, and integration tests** - `3d55c21` (feat)

## Files Created/Modified
- `src/diagnostics.ts` - MissingImportDiagnosticProvider: detects unimported schema symbols, offers quick-fix load() insertion
- `src/diagnostics.test.ts` - 10 tests covering diagnostic generation, code actions, builtin exclusion
- `src/extension.ts` - Full Phase 5 wiring: imports, module-level state, middleware merge, document handlers, clearSchemaCache command
- `src/schema.test.ts` - 5 new integration tests for Phase 5 wiring (clearSchemaCache, enabled/disabled, doc handlers)
- `src/schema-index.ts` - Added getFileForSymbol() reverse lookup and reverseIndex map
- `src/__mocks__/vscode.ts` - Added DiagnosticSeverity, Diagnostic, CodeAction, CodeActionKind, WorkspaceEdit, DocumentSymbol, SymbolKind, and workspace document event mocks
- `package.json` - Added schemas.registry, schemas.enabled settings and clearSchemaCache command
- `src/oci/auth.ts` - Fixed pre-existing unused variable lint error

## Decisions Made
- Used PascalCase regex `/\b([A-Z]\w*)\s*\(/g` to detect schema constructor calls, avoiding false positives on lowercase variable names
- Built reverse index (symbol -> file path) in SchemaIndex during walkDir for O(1) quick-fix lookups
- filePathToLoadPath converts cache-relative paths (schemas-k8s/v1.31/apps/v1.star) back to OCI load paths (schemas-k8s:v1.31/apps/v1.star) by replacing first path separator after artifact name with colon
- Used `unknown` intermediate cast for spreading scoping middleware into LanguageClient Middleware type (type-safe at runtime, loose at compile time)
- Mocked all Phase 5 modules in schema.test.ts to isolate extension wiring tests from module-level state persistence

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added getFileForSymbol reverse lookup to SchemaIndex**
- **Found during:** Task 1 (diagnostics implementation)
- **Issue:** SchemaIndex had no reverse lookup (symbol -> file path) needed for quick-fix code actions
- **Fix:** Added reverseIndex Map and getFileForSymbol() method, populated during walkDir
- **Files modified:** src/schema-index.ts
- **Verification:** Diagnostics tests pass with correct load path in quick-fix
- **Committed in:** 9535871 (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Fixed pre-existing lint error in oci/auth.ts**
- **Found during:** Task 2 (verification step - npm run compile)
- **Issue:** Unused `stderr` variable blocked lint/compile/package steps
- **Fix:** Removed variable assignment, kept stderr consumption to prevent backpressure
- **Files modified:** src/oci/auth.ts
- **Verification:** npm run compile and npm run package pass cleanly
- **Committed in:** 3d55c21 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both auto-fixes essential for functionality and build pipeline. No scope creep.

## Issues Encountered
- Module-level state in extension.ts persists across vitest test runs, requiring Phase 5 module mocks in schema.test.ts to isolate tests
- Scoping middleware types from middleware.ts use loose `unknown` parameters that don't match strict vscode-languageclient Middleware types, requiring `as unknown as Partial<Middleware>` cast

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 is now complete: all 4 plans delivered
- Full OCI auto-download and per-file load() scoping feature chain is wired end-to-end
- Feature gated behind schemas.enabled=false by default for safe rollout
- Ready for testing with real OCI registries when function-starlark v1.7 schema artifacts are published

---
*Phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense*
*Completed: 2026-03-21*
