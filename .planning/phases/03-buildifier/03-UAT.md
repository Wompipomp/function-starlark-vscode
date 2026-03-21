---
status: complete
phase: 03-buildifier
source: [03-01-SUMMARY.md]
started: 2026-03-21T15:00:00Z
updated: 2026-03-21T16:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Format Starlark File on Save
expected: Open `test-format.star` (or any `.star` file with messy formatting). Save the file. Buildifier auto-formats the content — indentation is corrected, spacing is normalized. The file content changes on save without any manual format command.
result: pass

### 2. Silent Degradation Without Buildifier
expected: Set `functionStarlark.buildifier.path` to a nonexistent path (e.g., `/tmp/no-such-buildifier`). Open and save a `.star` file. No error dialogs or popups appear. The file saves normally without formatting. A message is logged to the Output panel (Function Starlark channel) indicating buildifier was not found.
result: pass

### 3. Custom Buildifier Path Setting
expected: Open VS Code Settings (JSON or UI). Search for `functionStarlark.buildifier.path`. The setting exists and accepts a string value.
result: pass

### 4. Fix Lint on Format Setting
expected: Open VS Code Settings. Search for `functionStarlark.buildifier.fixLintOnFormat`. The setting exists as a boolean (default false).
result: pass

### 5. Prerequisites Documentation
expected: The extension's README or marketplace description tells users they need to install `buildifier` and `starlark-lsp` binaries, with install commands (e.g., `brew install buildifier`, `go install ...`).
result: issue
reported: "no readme"
severity: major

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "The extension's README or marketplace description tells users they need to install buildifier and starlark-lsp binaries, with install commands"
  status: failed
  reason: "User reported: no readme"
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
