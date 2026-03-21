---
phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense
plan: 01
subsystem: api
tags: [oci, docker, starlark, load-parser, credential-helper]

# Dependency graph
requires:
  - phase: 04-schema-intellisense
    provides: Schema cache infrastructure and LSP restart mechanism
provides:
  - Load statement parser with OCI path validation and resolution
  - Docker credential helper integration for private registry auth
  - Www-Authenticate Bearer challenge parser
affects: [05-02-PLAN, 05-03-PLAN, 05-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [OCI load path parsing, Docker credential helper spawn protocol, TDD red-green]

key-files:
  created:
    - src/load-parser.ts
    - src/load-parser.test.ts
    - src/oci/auth.ts
    - src/oci/auth.test.ts
  modified: []

key-decisions:
  - "Regex created inside parseLoadStatements function to avoid shared global state"
  - "OCI path detection uses dot-in-name heuristic to distinguish full URIs from short paths"
  - "Credential helper resolution: credHelpers > credsStore > static auths > anonymous"

patterns-established:
  - "Pure-logic modules with zero vscode dependency for testability"
  - "src/oci/ subdirectory for OCI-related modules"
  - "Docker credential helper spawn with stdin protocol and 5s timeout"

requirements-completed: [R7.1]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 5 Plan 01: Load Parser & Docker Auth Summary

**Regex-based load() statement parser with OCI path validation/resolution and Docker credential helper chain for private registry auth**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T19:12:41Z
- **Completed:** 2026-03-21T19:15:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Load statement parser extracts OCI references and imported symbols from .star file text
- isOciLoadPath correctly distinguishes OCI paths from Bazel labels and incomplete paths
- resolveOciRef handles both short paths (with default registry) and full OCI URIs
- Docker credential helper integration reads credHelpers/credsStore/static auths from ~/.docker/config.json
- Www-Authenticate parser extracts Bearer token exchange parameters for registry auth challenges

## Task Commits

Each task was committed atomically (TDD red-green):

1. **Task 1: Load statement parser** - `da0bd3b` (test: failing tests) -> `74f9c4b` (feat: implementation)
2. **Task 2: Docker credential helper** - `283ff51` (test: failing tests) -> `5d7a0c6` (feat: implementation)

_Note: TDD tasks each have two commits (test -> feat)_

## Files Created/Modified
- `src/load-parser.ts` - Load statement parser with OCI path validation, splitting, and resolution
- `src/load-parser.test.ts` - 22 unit tests covering all parser behaviors
- `src/oci/auth.ts` - Docker credential helper integration and Www-Authenticate parsing
- `src/oci/auth.test.ts` - 15 unit tests covering credential chain and Bearer parsing

## Decisions Made
- Regex created inside parseLoadStatements function body (not module-level) to avoid shared global state with /g flag
- OCI path detection uses dot-in-name heuristic: if the name portion before colon contains a dot, it's a full URI (ghcr.io/...), otherwise it's a short path resolved against default registry
- Credential helper resolution follows Docker's priority chain: credHelpers (registry-specific) > credsStore (default) > static auths (base64) > anonymous

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Load parser ready for Plan 02 (OCI download client) to use parseLoadStatements for triggering downloads
- Docker auth ready for Plan 02 to use getDockerCredentials for private registry authentication
- Both modules are pure-logic with zero vscode dependency, easily imported from extension code

## Self-Check: PASSED

All 4 created files verified on disk. All 4 task commits verified in git log.

---
*Phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense*
*Completed: 2026-03-21*
