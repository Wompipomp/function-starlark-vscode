---
phase: 06-extension-polish
plan: 01
subsystem: extension-lifecycle
tags: [vscode, schema-toggle, lifecycle, command-palette]

# Dependency graph
requires:
  - phase: 05-oci-download-scoping
    provides: SchemaIndex, OciDownloader, middleware scoping, diagnostics provider
provides:
  - showOutput command in Command Palette
  - Runtime schemas.enabled toggle with proper teardown/re-init
  - startLsp gating on schemas.enabled for --builtin-paths
  - clearAllDocumentImports for bulk cache clearing
  - schemaDisposables pattern preventing duplicate handler registration
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "initSchemaSubsystem/teardownSchemaSubsystem lifecycle pattern for clean enable/disable"
    - "schemaDisposables array to prevent duplicate event handler registration on repeated toggles"

key-files:
  created: []
  modified:
    - package.json
    - src/extension.ts
    - src/middleware.ts
    - src/schema.test.ts
    - src/middleware.test.ts
    - src/__mocks__/vscode.ts

key-decisions:
  - "showOutput command always visible (no when clause), category 'Function Starlark', title 'Show Output'"
  - "schemas.enabled toggle stops+recreates LSP client (not restart) because --builtin-paths args change"
  - "Silent teardown on disable -- cached files kept on disk, only runtime objects cleaned up"
  - "schemaDisposables array tracks document handlers and diagnostic registrations separately from context.subscriptions"

patterns-established:
  - "Subsystem lifecycle: initSchemaSubsystem/teardownSchemaSubsystem for clean runtime toggling"
  - "schemaDisposables pattern: track subsystem-specific disposables in separate array for targeted teardown"

requirements-completed: [R2, R7.6]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 6 Plan 01: Extension Polish Summary

**Schema subsystem lifecycle with runtime toggle, startLsp gating, showOutput command, and clearAllDocumentImports**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T11:56:04Z
- **Completed:** 2026-03-22T12:00:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added functionStarlark.showOutput to package.json contributes.commands for Command Palette discoverability
- Extracted initSchemaSubsystem/teardownSchemaSubsystem lifecycle functions for clean runtime toggling
- Gated startLsp --builtin-paths schema dir inclusion on schemas.enabled config
- Moved setupSchemaWatcher inside initSchemaSubsystem so it is not called when schemas disabled
- Added schemas.enabled config change handler that stops+recreates LSP client with correct args
- Added clearAllDocumentImports to middleware.ts for bulk cache clearing during teardown
- Added schemaDisposables pattern to prevent duplicate event handler registration
- Added textDocuments property to vscode mock for initSchemaSubsystem document scanning

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests** - `f5f9703` (test)
2. **Task 1 (GREEN): Implement schema lifecycle, startLsp gating, showOutput** - `fc4b8ec` (feat)
3. **Task 2: Full test suite and type check verification** - no changes needed (all 146 tests pass, types check, esbuild bundles)

## Files Created/Modified
- `package.json` - Added functionStarlark.showOutput command to contributes.commands
- `src/extension.ts` - Extracted initSchemaSubsystem/teardownSchemaSubsystem, gated startLsp, added schemas.enabled config handler
- `src/middleware.ts` - Added clearAllDocumentImports() export
- `src/schema.test.ts` - Added tests for showOutput, startup gating, runtime toggle
- `src/middleware.test.ts` - Added test for clearAllDocumentImports
- `src/__mocks__/vscode.ts` - Added textDocuments property to workspace mock

## Decisions Made
- showOutput command: always visible (no `when` clause), category "Function Starlark", title "Show Output"
- schemas.enabled toggle uses stop+recreate (not restart) because --builtin-paths args change
- Silent teardown: cached files kept on disk, only runtime objects (SchemaIndex, OciDownloader, watcher, diagnosticProvider) cleaned up
- schemaDisposables tracks document handlers and diagnostic registrations separately from context.subscriptions for targeted teardown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added textDocuments to vscode mock**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** initSchemaSubsystem scans vscode.workspace.textDocuments which was undefined in the mock
- **Fix:** Added `textDocuments: [] as unknown[]` to the workspace export in `src/__mocks__/vscode.ts`
- **Files modified:** src/__mocks__/vscode.ts
- **Verification:** All tests pass
- **Committed in:** fc4b8ec (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Fixed package.json test to bypass fs mock**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** The showOutput package.json test used fs.promises.readFile which is mocked by vi.mock("fs")
- **Fix:** Used `require("node:fs")` to get actual fs module and read package.json directly
- **Files modified:** src/schema.test.ts
- **Verification:** Test passes correctly
- **Committed in:** fc4b8ec (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for test infrastructure correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension polish complete -- all v1.0 integration gaps closed
- Schema subsystem lifecycle is correct: toggling at runtime works without reload
- Output channel is discoverable via Command Palette
- No schema infrastructure runs when schemas.enabled=false

## Self-Check: PASSED

All files verified present, all commit hashes confirmed in git log.

---
*Phase: 06-extension-polish*
*Completed: 2026-03-22*
