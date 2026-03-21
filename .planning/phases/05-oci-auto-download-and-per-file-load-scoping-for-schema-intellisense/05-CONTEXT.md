# Phase 5: OCI Auto-Download and Per-File Load() Scoping - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatically download schema OCI artifacts when load() statements reference them, and scope schema completions per-file based on what each file actually imports. Builds on Phase 4's global schema cache and FileSystemWatcher. Schema type warnings and lint diagnostics are out of scope.

</domain>

<decisions>
## Implementation Decisions

### OCI auto-download trigger
- Parse load() statements on file open and on file save/autosave
- Only trigger download when the load() path matches valid OCI format (has a colon-separated version tag AND a .star extension) — incomplete/half-typed paths are silently ignored
- If the referenced OCI artifact version is already in cache, skip download entirely — versions are immutable (version embedded in load path e.g., `schemas-k8s:v1.31`)
- Pure JS OCI client — no external binary dependency. Use `@oras-project/client` npm package or raw HTTP against OCI distribution API:
  1. `GET /v2/<repo>/manifests/<tag>` → get manifest with layer digest
  2. `GET /v2/<repo>/blobs/<digest>` → download the tar layer
  3. Extract with Node's built-in zlib/tar handling
- Extension is self-contained — works cross-platform with no oras/crane/starlark-gen binary

### Download UX
- Show download progress in the existing Starlark status bar item (e.g., "$(sync~spin) Starlark: pulling schemas-k8s:v1.31...")
- On download failure (network error, registry unreachable): log error to output channel, show subtle status bar warning icon. No notification toast. Consistent with silent degradation.
- No re-download logic — version is in the load path, cached versions are immutable

### OCI path resolution
- Dual mode for load() paths:
  1. **Short paths** with default registry: `load("schemas-k8s:v1.31/apps/v1.star", "Deployment")` → resolves to `{defaultRegistry}/schemas-k8s:v1.31`
  2. **Full OCI URIs**: `load("ghcr.io/someorg/custom-schemas:v2.0/path/file.star", "Symbol")` → used directly
- Single base registry setting: `functionStarlark.schemas.registry` (e.g., `"ghcr.io/wompipomp"`)
- Load path structure: `{oci-ref}/{tar-entry-path}` where OCI ref is `{artifact-name}:{tag}`

### OCI artifact structure
- Each OCI artifact is a single tar archive with nested .star files
- Artifact type: `application/vnd.fn-starlark.modules.v1+tar`
- Layer media type: `application/vnd.fn-starlark.layer.v1.tar`
- Example: `schemas-k8s:v1.31` contains ~37 .star files (apps/v1.star, core/v1.star, etc.) with 733 schemas
- Each .star file contains `schema()` and `field()` definitions with Google-style Args docstrings

### Cache layout
- Mirror load() paths: `{cacheDir}/schemas-k8s/v1.31/apps/v1.star`
- Directly maps to load() path structure — `load("schemas-k8s:v1.31/apps/v1.star")` → `{cacheDir}/schemas-k8s/v1.31/apps/v1.star`
- Multi-version coexistence (v1.31 and v1.32 live side by side)

### Registry authentication
- Use the user's existing Docker credential store — no extension-specific auth settings
- Read `~/.docker/config.json` → match registry against `credHelpers`/`credsStore`/base64 `auths`
- Spawn configured credential helper (e.g., `docker-credential-desktop`, `docker-credential-gcloud`) via stdin/stdout
- Parse JSON response `{ "Username": "...", "Secret": "..." }` → use as Bearer token or Basic auth header
- Public registries (ghcr.io public packages) work with anonymous pulls — no auth needed

### Per-file load() scoping
- Strict scoping: only show completions for explicitly imported symbols + builtins
- `load("...", "Deployment")` → only Deployment appears in completions, not other symbols from the same file
- `load("...", "*")` → imports all exported symbols from that .star file (consistent with Starlark semantics)
- Builtins (Resource, get, schema, field, etc.) always available regardless of load() statements
- Implementation: LanguageClient middleware filters completion/hover/signatureHelp responses based on the active file's load() imports. LSP still sees all schemas globally via --builtin-paths, middleware narrows per-file.

### Missing import diagnostics
- When a schema symbol from the cache is used in code but not imported via load(), show an info/hint diagnostic
- Offer a quick-fix code action to insert the appropriate load() statement
- Only applies to symbols known to exist in cached OCI artifacts — can't detect arbitrary missing imports

### Cache management
- Register a "Function Starlark: Clear Schema Cache" command that deletes all cached schemas
- Simple escape hatch for corrupted cache or fresh start

### Claude's Discretion
- Exact load() path parsing regex/implementation
- OCI distribution API error handling and retry logic
- Docker credential helper spawning details
- Debounce timing for load() parsing on save events
- How middleware indexes cached symbols for fast lookup
- Quick-fix code action positioning (top of file, after existing loads, etc.)

</decisions>

<specifics>
## Specific Ideas

- Extension should be fully self-contained — pure JS OCI client, no external binary for downloads
- Docker credential store is the standard auth mechanism — same as oras, crane, and docker use under the hood
- Load path format: `load("schemas-k8s:v1.31/apps/v1.star", "Deployment")` where `schemas-k8s:v1.31` is the OCI reference and `apps/v1.star` is the tar entry path
- Version immutability means caching is simple — download once, never re-download for the same version

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getSchemaCachePath()` in extension.ts: Already resolves schema cache path (globalStoragePath or override) — extend for new cache layout
- `setupSchemaWatcher()` in extension.ts: FileSystemWatcher with debounced LSP restart — continues working with new cache structure
- `middleware` in LanguageClient options: Already handles documentSymbol fixes — extend with completion/hover/signatureHelp filtering
- `binaryExists()` pattern: Reusable for Docker credential helper detection
- `outputChannel`: Shared LogOutputChannel for download logging

### Established Patterns
- Settings namespace: `functionStarlark.{feature}.{setting}` — add `schemas.registry`
- Silent degradation: return empty results when optional features unavailable
- Status bar state: checkmark/X/spinner pattern for LSP state — extend for download progress
- Config change handling: restart LSP on settings change — extend for registry changes

### Integration Points
- `src/extension.ts` startLsp(): Cache directory already passed as --builtin-paths — no change needed
- `src/extension.ts` activate(): Add load() parser, OCI downloader, middleware extensions
- `package.json` contributes.configuration: Add `functionStarlark.schemas.registry` setting
- `package.json` contributes.commands: Add "Clear Schema Cache" command
- New modules needed: OCI client, load() parser, Docker credential resolver, completion middleware

</code_context>

<deferred>
## Deferred Ideas

- **Schema type warnings (R7.5):** Warn on missing required fields or type mismatches in constructor calls. Requires deeper analysis of schema definitions beyond simple completions.
- **Per-prefix registry overrides:** Map individual load() prefixes to different registries. Currently using single base registry — add if multi-source setups emerge.
- **Workspace-wide load() scanning:** Scan all .star files on workspace open to pre-download schemas. Currently only triggers on file open/save.

</deferred>

---

*Phase: 05-oci-auto-download-and-per-file-load-scoping-for-schema-intellisense*
*Context gathered: 2026-03-21*
