# Phase 4: Schema IntelliSense - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `schema()` and `field()` builtins to the extension for autocomplete and hover docs. Provide IntelliSense for schema constructors from local `.star` files in a cache directory (globalStoragePath or configurable override). Watch cache for changes and restart LSP. No OCI auto-download, no load() parsing, no per-file scoping — those are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Schema builtins (schema() and field())
- Add `schema()` and `field()` construction signatures to `starlark/builtins.py` with full Google-style Args docstrings
- `field()` docstring documents that `type` accepts primitive strings ("string", "int", "float", "bool", "list", "dict") OR a schema reference for nested validation; `items` accepts a schema for list element validation
- Construction signatures only — no introspection attributes (.name, .fields, .doc) since starlark-lsp can't provide attribute completions on return values
- Bump builtins.py version header to `# Targets: function-starlark v1.7+`

### Schema cache directory
- Use VS Code's `globalStoragePath` (per-extension global storage, e.g., `~/.vscode/globalStorage/wompipomp.vscode-function-starlark/`) as the default cache location
- Always pass this directory as additional `--builtin-paths` arg to the LSP alongside the bundled builtins
- All `.star` files in the cache become globally available for completions (no per-file scoping)
- Watch cache directory with debounced `FileSystemWatcher` — restart LSP on changes (files added/removed/changed)
- Watch only — extension does NOT download schemas. User populates cache externally (oras pull, starlark-gen, manual copy)

### Settings
- `functionStarlark.schemas.path` — optional string setting, default empty. When set, use this path INSTEAD of globalStoragePath for schema discovery. Useful for teams with shared schema dirs.
- No `functionStarlark.schemas.enabled` toggle — schema cache watching is always on. Empty cache = no extra completions (harmless). Aligns with zero-config principle.

### Graceful degradation
- Silent — always pass cache dir as `--builtin-paths`. If empty or nonexistent, LSP gets no extra completions. No warnings, no prompts, no log messages.
- Builtin completions (including schema/field) always work regardless of cache state
- Consistent with Phase 2-3 silent degradation pattern

### Claude's Discretion
- FileSystemWatcher debounce timing (300-500ms range per R7.6)
- Whether to pass cache dir as single --builtin-paths arg or merge with existing builtins path
- Exact globalStoragePath subdirectory structure (flat vs nested)
- How starlark-lsp handles multiple --builtin-paths args (may need testing)

</decisions>

<specifics>
## Specific Ideas

- Zero-config principle: extension should work with no settings changed. Schemas just appear when user downloads them to the cache.
- The function-starlark runtime's schema API is documented in function-starlark-gsd/schema/ (Go source). Use that as the source of truth for schema()/field() signatures and docstrings.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `starlark/builtins.py`: All current builtins with Google-style Args docstrings — add schema() and field() following same pattern
- `src/extension.ts` startLsp(): Already constructs `--builtin-paths` arg pointing to builtins.py — extend to include cache directory
- `binaryExists()` pattern: Reusable for checking cache directory existence
- `outputChannel`: Shared LogOutputChannel available for any needed logging

### Established Patterns
- Settings namespace: `functionStarlark.{feature}.{setting}` (lsp.path, buildifier.path, etc.)
- Silent degradation: return empty results when optional tool/path missing, log at most once
- Binary/path detection: `which`/`where` for binaries, `fs.existsSync` for absolute paths

### Integration Points
- `src/extension.ts` startLsp(): Add cache directory to `--builtin-paths` args
- `src/extension.ts` activate(): Set up FileSystemWatcher for cache directory
- `package.json` contributes.configuration: Add `functionStarlark.schemas.path` setting
- `starlark/builtins.py`: Add schema() and field() stubs

</code_context>

<deferred>
## Deferred Ideas

- **OCI auto-download (Phase 5):** Parse load() statements to detect OCI references, auto-download artifacts to cache, handle private registry auth. Full zero-config schema IntelliSense without manual downloads.
- **Per-file load() scoping (Phase 5):** Parse load() statements per file, only provide completions for imported symbols. LanguageClient middleware approach.
- **Schema type warnings:** Warn on missing required fields or type mismatches in constructor calls. Requires deeper LSP integration.
- **Download command:** Register a "Function Starlark: Download Schemas" command that runs oras/starlark-gen in a terminal.

</deferred>

---

*Phase: 04-schema-intellisense*
*Context gathered: 2026-03-21*
