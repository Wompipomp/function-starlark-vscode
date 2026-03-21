---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: milestone
status: executing
stopped_at: Completed 05-03-PLAN.md
last_updated: "2026-03-21T19:23:27.073Z"
last_activity: 2026-03-21 -- Completed 05-03 schema index and scoping middleware
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 11
  completed_plans: 10
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** Install the extension, open a .star file, get autocomplete and hover docs for all function-starlark builtins immediately.
**Current focus:** Phase 5: OCI Auto-Download & Load Scoping

## Current Position

Phase: 5 of 5 (OCI Auto-Download & Load Scoping)
Plan: 3 of 4 in current phase (Plan 03 complete)
Status: Phase 05 In Progress -- Plan 03 complete
Last activity: 2026-03-21 -- Completed 05-03 schema index and scoping middleware

Progress: [████████--] 82%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 4min | 2 tasks | 9 files |
| Phase 01 P02 | 3min | 2 tasks | 7 files |
| Phase 02 P01 | 2min | 2 tasks | 3 files |
| Phase 02 P02 | 3min | 2 tasks | 1 files |
| Phase 03 P01 | 5min | 2 tasks | 3 files |
| Phase 04 P01 | 2min | 2 tasks | 3 files |
| Phase 04 P02 | 7min | 2 tasks | 3 files |
| Phase 05 P01 | 3min | 2 tasks | 4 files |
| Phase 05 P03 | 3min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 4-phase structure derived from requirements -- Foundation, LSP Core, Buildifier, Schema IntelliSense
- [Roadmap]: Phase 4 (Schema IntelliSense) blocked on upstream deps, split into sub-phases 4a (LSP restart) and 4b (middleware)
- [Phase 01]: Used official esbuild-sample pattern for build pipeline
- [Phase 01]: ESLint flat config (eslint.config.mjs) with typescript-eslint unified package
- [Phase 01]: Apache-2.0 attribution (not MIT) per actual vscode-bazel license
- [Phase 01]: Excluded CLAUDE.md from VSIX via .vscodeignore
- [Phase 02]: Used connectionOptions.maxRestartCount: 3 instead of custom ErrorHandler
- [Phase 02]: Changed --builtin-paths from directory to file path -- directory caused module namespacing in starlark-lsp
- [Phase 02]: Used fs.existsSync for absolute paths, which/where for PATH lookups
- [Phase 03]: Used spawn with stdin pipe instead of promisify(execFile) -- TypeScript types lack input option
- [Phase 03]: Duplicated binaryExists() in buildifier.ts to avoid circular imports
- [Phase 04]: Schema section placed after Resource requirements in builtins.py
- [Phase 04]: schemas.path uses empty string default -- empty means use globalStoragePath
- [Phase 04]: Removed vi.mock("vscode") from schema tests -- vitest alias provides mock, vi.mock was overriding implementations
- [Phase 04]: Used function constructor pattern for LanguageClient mock to support new keyword
- [Phase 05]: Regex created inside parseLoadStatements function to avoid shared global state
- [Phase 05]: OCI path detection uses dot-in-name heuristic for full URI vs short path distinction
- [Phase 05]: Credential helper resolution: credHelpers > credsStore > static auths > anonymous
- [Phase 05]: BUILTIN_NAMES is static ReadonlySet of 21 names matching builtins.py
- [Phase 05]: Middleware caches allowed symbols per document URI to avoid re-parsing load() on every request
- [Phase 05]: Star import expands via SchemaIndex.getSymbolsForFile() using tarEntryPath as lookup key

### Roadmap Evolution

- Phase 5 added: OCI auto-download and per-file load() scoping for schema IntelliSense

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 4 blocked on function-starlark v1.7 and starlark-gen producing stable schema files

## Session Continuity

Last session: 2026-03-21T19:22:00Z
Stopped at: Completed 05-03-PLAN.md
Resume file: .planning/phases/05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense/05-03-SUMMARY.md
