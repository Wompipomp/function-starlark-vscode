---
phase: 04-schema-intellisense
plan: 02
subsystem: lsp
tags: [starlark, schema, filesystemwatcher, debounce, builtin-paths, vscode-lsp]

# Dependency graph
requires:
  - phase: 04-schema-intellisense
    provides: schema() and field() builtin stubs, schemas.path config setting, extended vscode mock
  - phase: 02-lsp-core
    provides: starlark-lsp integration with --builtin-paths and LanguageClient lifecycle
provides:
  - Schema cache directory wired into LSP via dual --builtin-paths args
  - Debounced FileSystemWatcher for automatic LSP restart on schema file changes
  - schemas.path config change handling with full client teardown and watcher recreation
  - getSchemaCachePath() for resolving configured or default schema cache path
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [dual --builtin-paths for bundled builtins + schema cache, debounced FileSystemWatcher with RelativePattern, config-triggered client teardown/restart]

key-files:
  created:
    - src/schema.test.ts
  modified:
    - src/extension.ts
    - src/__mocks__/vscode.ts

key-decisions:
  - "Removed vi.mock('vscode') from schema tests -- vitest alias already provides the mock, vi.mock auto-mocking was overriding Uri.file implementation"
  - "Used function constructor pattern for LanguageClient mock to support new LanguageClient() in tests"

patterns-established:
  - "Schema tests import directly from mock alias without vi.mock('vscode') -- prevents auto-mock from overriding vi.fn implementations"
  - "Debounced FileSystemWatcher pattern: clearTimeout/setTimeout 400ms for coalescing rapid file events"

requirements-completed: [R7.6]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 4 Plan 02: Schema Cache Integration Summary

**Dual --builtin-paths LSP wiring with debounced FileSystemWatcher for automatic schema IntelliSense on cache changes**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T16:44:09Z
- **Completed:** 2026-03-21T16:51:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- getSchemaCachePath() resolves schemas.path setting or falls back to globalStorageUri.fsPath
- startLsp() passes both bundled builtins.py and schema cache directory as dual --builtin-paths arguments
- FileSystemWatcher watches **/*.py in schema cache dir with 400ms debounced LSP restart
- schemas.path config change triggers full client teardown, startLsp(), and watcher recreation
- Existing lsp.path and lsp.enabled config handling preserved unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema cache path resolution and dual --builtin-paths** - `f872552` (feat)
2. **Task 2: FileSystemWatcher with debounce and config handling** - `9696650` (feat)

_Note: TDD tasks each had RED commit (test) then GREEN commit (feat). Final commits squash both._

## Files Created/Modified
- `src/extension.ts` - Added getSchemaCachePath(), setupSchemaWatcher(), dual --builtin-paths args, schemas.path config change handler
- `src/schema.test.ts` - 13 unit tests covering path resolution, mkdirSync, dual args, watcher setup, debounce, config changes
- `src/__mocks__/vscode.ts` - Uri.file/parse wrapped in vi.fn(), added window/commands/languages/env/StatusBarAlignment mocks

## Decisions Made
- Removed `vi.mock("vscode")` from schema tests because the vitest alias already resolves vscode to the mock file; `vi.mock()` was auto-mocking over our `vi.fn()` implementations, causing `Uri.file` to return undefined
- Used `function` constructor pattern (not arrow function) for LanguageClient mock to support `new LanguageClient()` call syntax in tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vscode mock auto-mocking conflict**
- **Found during:** Task 2 (FileSystemWatcher tests)
- **Issue:** `vi.mock("vscode")` auto-mocked all exports including `Uri.file`, overriding the manual mock implementation with an empty `vi.fn()` that returned undefined. This caused RelativePattern to receive undefined as its base argument.
- **Fix:** Removed `vi.mock("vscode")` from schema.test.ts since the vitest alias already resolves to the mock file. Made `Uri.file` and `Uri.parse` use `vi.fn()` wrappers in the mock for proper `clearAllMocks` support.
- **Files modified:** src/schema.test.ts, src/__mocks__/vscode.ts
- **Verification:** All 21 tests pass (8 buildifier + 13 schema)
- **Committed in:** 9696650 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for test infrastructure correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema IntelliSense is fully wired: starlark-lsp receives schema .py files via second --builtin-paths
- FileSystemWatcher monitors cache directory and restarts LSP on changes
- schemas.path setting allows custom cache directory override
- All 21 tests pass, types clean, lint clean, compile succeeds
- Phase 4 is complete -- all plans executed

## Self-Check: PASSED

- All 3 modified/created files exist on disk
- Both task commits (f872552, 9696650) found in git log

---
*Phase: 04-schema-intellisense*
*Completed: 2026-03-21*
