# Function Starlark for VS Code

Starlark IDE support for [function-starlark](https://github.com/wompipomp/function-starlark) Crossplane compositions — autocomplete, hover docs, signature help, syntax highlighting, and format-on-save.

## Features

- **Autocomplete** — All function-starlark builtins (`Resource()`, `get()`, `set_condition()`, etc.) with full parameter signatures
- **Hover docs** — Inline documentation for builtins, predeclared variables (`oxr`, `dxr`, `observed`, `context`, `environment`, `extra_resources`), and their parameters
- **Signature help** — Parameter hints as you type function calls
- **Syntax highlighting** — Full Starlark grammar support for `.star` files
- **Format-on-save** — Automatic formatting via [buildifier](https://github.com/bazelbuild/buildtools/tree/master/buildifier) with optional lint fixing
- **Status bar** — LSP connection status indicator for `.star` files

## Prerequisites

This extension requires two external tools. Install them before using the extension.

### 1. starlark-lsp (required for autocomplete, hover docs, signature help)

The extension uses [starlark-lsp](https://github.com/tilt-dev/starlark-lsp) as its language server.

**Via Go:**

```bash
go install github.com/tilt-dev/starlark-lsp@latest
```

Make sure `$GOPATH/bin` (typically `~/go/bin`) is in your `PATH`.

### 2. buildifier (required for formatting)

The extension uses [buildifier](https://github.com/bazelbuild/buildtools/tree/master/buildifier) for format-on-save.

**Via Homebrew (macOS/Linux):**

```bash
brew install buildifier
```

**Via Go:**

```bash
go install github.com/bazelbuild/buildtools/buildifier@latest
```

> Without buildifier installed, the extension works normally but formatting is silently disabled.

## Getting Started

1. Install the prerequisites above
2. Install this extension
3. Open any `.star` file — autocomplete, hover docs, and format-on-save work automatically

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `functionStarlark.lsp.path` | string | `starlark-lsp` | Path to the starlark-lsp binary |
| `functionStarlark.lsp.enabled` | boolean | `true` | Enable/disable the language server |
| `functionStarlark.buildifier.path` | string | `buildifier` | Path to the buildifier binary |
| `functionStarlark.buildifier.fixLintOnFormat` | boolean | `false` | Apply buildifier lint fixes when formatting |
| `functionStarlark.trace.server` | string | `off` | Trace LSP communication (`off`, `messages`, `verbose`) |

If `starlark-lsp` or `buildifier` is installed in a non-standard location, set the full path in the corresponding setting.

## Commands

| Command | Description |
|---------|-------------|
| `Function Starlark: Restart Starlark LSP` | Restart the language server |

## Supported Builtins

The extension provides IDE support for all function-starlark builtins:

### Predeclared Variables

| Variable | Description |
|----------|-------------|
| `oxr` | Observed composite resource (read-only) |
| `dxr` | Desired composite resource (mutable) |
| `observed` | Observed composed resources by name |
| `context` | Pipeline context for cross-step data |
| `environment` | EnvironmentConfig data (read-only) |
| `extra_resources` | Resources fetched via `require_extra_resource()` |

### Functions

| Function | Description |
|----------|-------------|
| `Resource()` | Create a desired composed resource |
| `skip_resource()` | Intentionally skip a resource with a warning event |
| `get()` | Safely access nested dict values via dot-path |
| `get_label()` | Get a label value from a resource |
| `get_annotation()` | Get an annotation value from a resource |
| `get_observed()` | Get a value from an observed composed resource |
| `set_condition()` | Set a status condition on the XR |
| `set_xr_status()` | Write a value into XR status at a dot-path |
| `emit_event()` | Emit a Kubernetes event |
| `set_connection_details()` | Set XR-level connection details |
| `fatal()` | Halt execution with a fatal error |
| `require_extra_resource()` | Request a single extra resource |
| `require_extra_resources()` | Request multiple matching extra resources |

## Troubleshooting

**No autocomplete or hover docs:**
- Check that `starlark-lsp` is installed and on your `PATH`: `which starlark-lsp`
- Check the Output panel (View > Output > "Function Starlark LSP") for errors
- Try restarting the server: Command Palette > "Function Starlark: Restart Starlark LSP"

**Format-on-save not working:**
- Check that `buildifier` is installed and on your `PATH`: `which buildifier`
- Check the Output panel for "Buildifier not found" warnings
- Verify format-on-save is enabled: `editor.formatOnSave` should be `true` for starlark files (enabled by default)

**Custom binary locations:**
- Set `functionStarlark.lsp.path` to the full path of `starlark-lsp`
- Set `functionStarlark.buildifier.path` to the full path of `buildifier`

## License

Apache-2.0
