# Requirements: vscode-function-starlark

## R1: Syntax Highlighting
- Register `.star` files as `starlark` language via `contributes.languages`
- Provide TextMate grammar for Starlark syntax (keywords, strings, comments, functions, operators)
- Source grammar from vscode-bazel (MIT licensed), use as-is — scope name `source.starlark`
- Language configuration with bracket matching, auto-closing pairs, comment toggling, and `wordPattern` for snake_case identifiers
- Implicit activation — no explicit `activationEvents` needed (VSCode ≥1.74 auto-generates from `contributes.languages`)

## R2: Language Server Integration
- Spawn `starlark-lsp start` as an LSP server using `vscode-languageclient` v9
- Pass `--builtin-paths` pointing to the bundled builtins stub directory
- Communicate over stdio (`command`-style `ServerOptions`)
- Configurable binary path via extension settings (`functionStarlark.lsp.path`, default: `"starlark-lsp"`)
- Configurable enable/disable via settings (`functionStarlark.lsp.enabled`, default: `true`)
- LSP trace setting (`functionStarlark.trace.server`) — auto-read by LanguageClient for debug logging
- Dedicated output channel (`Function Starlark LSP`) with `revealOutputChannelOn: RevealOutputChannelOn.Error`
- Restart command (`functionStarlark.restartServer`) registered via `contributes.commands`
- Watch for configuration changes — restart LanguageClient when `lsp.path` or `lsp.enabled` changes
- Push LanguageClient to `context.subscriptions` for automatic disposal on deactivation

## R3: Builtin Stubs
- Python-style stub file defining all function-starlark builtins
- Must include accurate function signatures with all parameters and defaults
- Must include docstrings with parameter descriptions (Google-style `Args:` format)
- Must define predeclared variables with string literal docstrings (NOT comments — starlark-lsp requires `"""docstring"""` after assignment, ignores `# comment`)
- Function bodies use `pass` statement

### R3.1: Builtin Functions
- `Resource(name, body, ready=None, labels=None, connection_details=None, depends_on=None, external_name=None)`
- `skip_resource(name, reason)`
- `get(obj, path, default=None)`
- `get_label(res, key, default=None)`
- `get_annotation(res, key, default=None)`
- `get_observed(name, path, default=None)`
- `set_condition(type, status, reason, message, target="Composite")`
- `set_xr_status(path, value)`
- `emit_event(severity, message, target="Composite")`
- `set_connection_details(details_dict)`
- `fatal(message)`
- `require_extra_resource(name, apiVersion, kind, match_name=None, match_labels=None)`
- `require_extra_resources(name, apiVersion, kind, match_labels)`

### R3.2: Predeclared Variables
- `oxr` — observed composite resource (frozen dict)
- `dxr` — desired composite resource (mutable dict)
- `observed` — observed composed resources (frozen dict of frozen dicts)
- `context` — pipeline context (mutable dict)
- `environment` — environment config (frozen dict)
- `extra_resources` — required resources (frozen dict)

## R4: Error Handling
- Pre-check binary availability using `which` (macOS/Linux) / `where` (Windows) before spawning
- Show actionable notification with two buttons: "Install" (opens terminal with `go install github.com/tilt-dev/starlark-lsp@latest`) and "Configure Path" (opens settings)
- Extension must still provide syntax highlighting even without LSP (graceful degradation)
- Log errors to dedicated output channel for debugging

## R5: Extension Packaging
- Valid `package.json` with publisher, name, description, icon
- Bundle with esbuild — single output to `dist/extension.js`, `vscode` as external
- `.vscodeignore` excluding: `node_modules/`, `src/`, `.planning/`, `out/`, `*.ts`, `tsconfig.json`
- `.vscodeignore` including: `dist/`, `starlark/`, `syntaxes/`, `language-configuration.json`
- `vscode:prepublish` script running esbuild in production mode
- `main` field pointing to `"./dist/extension.js"`
- Package as `.vsix` via `vsce package` for local installation

## R6: Buildifier Integration
- Register `DocumentFormattingEditProvider` for `starlark` language
- Spawn buildifier with `--mode=fix --path=${filePath}`, content via stdin, formatted output from stdout
- Configurable buildifier path (`functionStarlark.buildifier.path`, default: `"buildifier"`)
- Silently skip formatting if buildifier binary not found (no error notification — it is optional)
- Optional lint fixing via `functionStarlark.buildifier.fixLintOnFormat` setting (adds `--lint=fix`)

## R7: Schema IntelliSense (Future — blocked on function-starlark v1.7 + starlark-gen)

Typed autocomplete and validation for schema constructors loaded from generated `.star` schema files.

**Depends on:**
- function-starlark v1.7 — schema runtime API defining constructor format
- starlark-gen — CLI producing `.star` schema files from OpenAPI / CRD YAML

**Phased approach:**
- **R7-Phase A (LSP Restart):** Pass schema directory as additional `--builtin-paths` arg. Restart LSP on schema file changes (debounced FileSystemWatcher). All schema constructors available globally. Near-zero custom code.
- **R7-Phase B (Load-Aware Middleware):** Parse `load()` statements per file. Resolve to schema cache. Use LanguageClient middleware to scope completions. Add diagnostics for type warnings. Larger effort.

### R7.1: Load Statement Resolution
- Parse `load()` statements in the open `.star` file to identify imported schema symbols
- Resolve loaded symbols to their source `.star` files from a configured local schema cache directory
- Support both named imports (`load("...", "DeploymentSpec")`) and star imports (`load("...", "*")`)
- Resolve OCI-style paths to local cache paths (`k8s:v1.31/apps/v1/deployment.star` → `{schemasDir}/k8s/v1.31/apps/v1/deployment.star`)

### R7.2: Schema Constructor Autocomplete
- Provide autocomplete for constructor kwargs based on parsed schema `.star` files
- Show parameter types (int, string, bool, list, nested schema name) in completion items
- Mark required fields distinctly from optional fields in completion list

### R7.3: Schema Hover Documentation
- Show field descriptions from OpenAPI spec (carried in Google-style Args docstrings) on hover
- Show type, default value, and required/optional status
- Show parent type name and API group/version context

### R7.4: Schema Signature Help
- Show full constructor signature with parameter types while typing inside constructor call
- Highlight active parameter as user types

### R7.5: Schema Type Warnings
- Warn when a required field is omitted from a constructor call
- Warn when a field value type doesn't match the expected type (string where int expected)
- No warnings for plain dict values — schema validation is opt-in at every nesting level

### R7.6: Schema Cache Management
- Configurable `functionStarlark.schemas.path` setting pointing to local schema directory
- Configurable `functionStarlark.schemas.enabled` toggle (default: false)
- Watch schema directory with debounced `FileSystemWatcher` (300-500ms) — restart LSP on changes
- Extension degrades gracefully when schemas not downloaded — builtins IntelliSense still works
- User downloads schemas via `starlark-gen pull` CLI (extension does not manage OCI pulls)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| R1: Syntax Highlighting | Phase 1 | Complete |
| R2: Language Server Integration | Phase 2, Phase 6 | Complete (showOutput command palette fix in Phase 6) |
| R3: Builtin Stubs (R3.1, R3.2) | Phase 2 | Complete |
| R4: Error Handling | Phase 2 | Complete |
| R5: Extension Packaging | Phase 1 | Complete |
| R6: Buildifier Integration | Phase 3 | Complete |
| R7.1: Load Statement Resolution | Phase 5 | Complete |
| R7.2: Schema Constructor Autocomplete | Phase 4, Phase 5 | Complete |
| R7.3: Schema Hover Documentation | Phase 4, Phase 5 | Complete |
| R7.4: Schema Signature Help | Phase 4, Phase 5 | Complete |
| R7.5: Schema Type Warnings | — | Deferred to future milestone |
| R7.6: Schema Cache Management | Phase 4, Phase 5, Phase 6 | Complete (schemas.enabled toggle fix in Phase 6) |
