# CLAUDE.md

## Project Overview

VSCode extension for function-starlark composition authoring. Provides syntax highlighting, autocomplete, hover docs, and signature help for Starlark `.star` files used with [function-starlark](https://github.com/wompipomp/function-starlark).

## Architecture

- **Thin LSP wrapper** — spawns `tilt-dev/starlark-lsp` as the language server
- **Bundled builtins** — `starlark/builtins.py` defines all custom function-starlark builtins as Python-style stubs
- **TextMate grammar** — `syntaxes/starlark.tmGrammar.json` for syntax highlighting
- **TypeScript** — minimal extension code in `src/extension.ts`

## Key Design Decisions

- Users must install `starlark-lsp` binary separately (`go install github.com/tilt-dev/starlark-lsp/cmd/starlark-lsp@latest`)
- Extension bundles the builtins stub file — updates to builtins come with extension updates
- Uses `vscode-languageclient` npm package for LSP client
- TextMate grammar sourced from vscode-bazel (MIT licensed)
- Extension activates for any `.star` file in any workspace

## Commands

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode
npm run package      # Create .vsix package
npm run lint         # Run ESLint
```

## Planning

- PRD and requirements: `.planning/PRD.md`, `.planning/REQUIREMENTS.md`
- Use `/gsd:new-project` to set up the project roadmap
