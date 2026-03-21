---
phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense
plan: 02
subsystem: api
tags: [oci, docker, nanotar, tar, fetch, registry, download, cache]

# Dependency graph
requires:
  - phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense
    provides: Load parser (resolveOciRef) and Docker auth (getDockerCredentials, parseWwwAuthenticate) from Plan 01
provides:
  - OCI Distribution API client with 401 challenge-response Bearer token auth
  - Download orchestrator with cache-first strategy, atomic extraction, and concurrent dedup
affects: [05-03-PLAN, 05-04-PLAN]

# Tech tracking
tech-stack:
  added: [nanotar]
  patterns: [OCI manifest+blob two-step pull, 401 challenge-response token exchange, atomic cache population via temp+rename, in-flight promise dedup map]

key-files:
  created:
    - src/oci/client.ts
    - src/oci/client.test.ts
    - src/oci/downloader.ts
    - src/oci/downloader.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Used function constructor pattern in vi.mock for OciClient to support new keyword in tests"
  - "Atomic cache population: write to temp dir then rename, preventing partial cache on failure"
  - "In-flight promise map keyed by full resolved registry/repository:tag for dedup"

patterns-established:
  - "OCI Distribution API client: two-step manifest+blob pull with cached Bearer token"
  - "Atomic cache directory population: temp dir + rename + cleanup on failure"
  - "Concurrent download deduplication via Map<string, Promise<string>> with finally() cleanup"

requirements-completed: [R7.1, R7.6]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 5 Plan 02: OCI Pull Client & Download Orchestrator Summary

**OCI Distribution API client with 401 Bearer token auth and download orchestrator with cache-first, atomic extraction, and concurrent dedup using nanotar**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T19:18:27Z
- **Completed:** 2026-03-21T19:21:54Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- OCI client fetches manifests and blobs with proper Accept headers and 401 challenge-response Bearer token authentication
- 401 auth flow works for both authenticated (Basic credentials) and anonymous (public registry) pulls
- Download orchestrator checks cache first (version immutability), pulls and extracts only on cache miss
- Atomic cache population prevents partial directories on download failure
- Concurrent downloads for same OCI ref deduplicated via in-flight promise map
- nanotar added as production dependency for tar extraction

## Task Commits

Each task was committed atomically (TDD red-green):

1. **Task 1: OCI Distribution API client** - `070b138` (test: failing tests) -> `5b16774` (feat: implementation)
2. **Task 2: Download orchestrator** - `d5981b4` (test: failing tests) -> `78c4c8a` (feat: implementation)

_Note: TDD tasks each have two commits (test -> feat)_

## Files Created/Modified
- `src/oci/client.ts` - OCI Distribution API client with manifest/blob fetch and Bearer token auth
- `src/oci/client.test.ts` - 9 unit tests covering auth flows, token reuse, and error handling
- `src/oci/downloader.ts` - Download orchestrator with cache check, pull, tar extraction, and dedup
- `src/oci/downloader.test.ts` - 10 unit tests covering cache hit/miss, dedup, failure cleanup
- `package.json` - Added nanotar as production dependency
- `package-lock.json` - Updated lockfile

## Decisions Made
- Used function constructor pattern (`vi.fn(function() {...})`) in mock factory for OciClient to support `new` keyword -- arrow functions are not constructable in JavaScript
- Atomic cache population: extract to temp directory (`{path}.tmp.{random}`), then `fs.renameSync` to final path; on failure, `fs.rmSync` the temp dir to prevent partial cache entries
- In-flight promise map keyed by fully-resolved `registryHost/repository:tag` to correctly deduplicate concurrent downloads

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- OCI client and downloader ready for Plan 03 (middleware/integration) to trigger downloads on load() detection
- OciClient is imported by OciDownloader; OciDownloader is the public API for the rest of the extension
- Both modules have zero vscode dependency, testable in isolation
- 34 total OCI tests pass across auth, client, and downloader modules

## Self-Check: PASSED

All 4 created files verified on disk. All 4 task commits verified in git log.

---
*Phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense*
*Completed: 2026-03-21*
