import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { platform } from "os";

import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  type Middleware,
  RevealOutputChannelOn,
  ServerOptions,
  State,
} from "vscode-languageclient/node";
import type { DocumentSymbol } from "vscode-languageserver-types";
import { BuildifierFormatProvider } from "./buildifier";
import { ociRefToCacheKey, parseLoadStatements } from "./load-parser";
import { OciDownloader } from "./oci/downloader";
import { SchemaIndex } from "./schema-index";
import { createScopingMiddleware, updateDocumentImports, clearDocumentImports } from "./middleware";
import { MissingImportDiagnosticProvider } from "./diagnostics";
import { generateStubFile, generateNamespaceStubs } from "./schema-stubs";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.LogOutputChannel | undefined;
let notificationShown = false;
let schemaWatcher: vscode.FileSystemWatcher | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let schemaIndex: SchemaIndex | undefined;
let downloader: OciDownloader | undefined;
let diagnosticProvider: MissingImportDiagnosticProvider | undefined;

export function getSchemaCachePath(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration("functionStarlark");
  const override = config.get<string>("schemas.path", "");
  if (override) {
    return override;
  }
  return context.globalStorageUri.fsPath;
}

/**
 * Scan all open starlark documents for namespace load imports and collect
 * which cache-relative .star files map to which namespace names.
 *
 * Returns a Map of namespace name → list of cache-relative file paths.
 */
function collectNamespaceFiles(
  _context: vscode.ExtensionContext,
): Map<string, string[]> {
  const nsFiles = new Map<string, string[]>();

  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId !== "starlark") continue;
    const loads = parseLoadStatements(doc.getText());
    for (const load of loads) {
      for (const ns of load.namespaces) {
        if (ns.value === "*") {
          const cachePath = ociRefToCacheKey(load.ociRef) + "/" + load.tarEntryPath;
          const existing = nsFiles.get(ns.name) ?? [];
          if (!existing.includes(cachePath)) {
            existing.push(cachePath);
          }
          nsFiles.set(ns.name, existing);
        }
      }
    }
  }

  return nsFiles;
}

export function setupSchemaWatcher(
  context: vscode.ExtensionContext,
): vscode.FileSystemWatcher {
  const schemaDir = getSchemaCachePath(context);
  // Only watch _schemas.py — the single stub file starlark-lsp reads.
  // Watching *.star would trigger restarts for every OCI-extracted file.
  const pattern = new vscode.RelativePattern(
    vscode.Uri.file(schemaDir),
    "_schemas.py",
  );
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  function scheduleRestart() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      debounceTimer = undefined;
      if (client && client.isRunning()) {
        await client.restart();
      }
    }, 400);
  }

  watcher.onDidCreate(scheduleRestart);
  watcher.onDidChange(scheduleRestart);
  watcher.onDidDelete(scheduleRestart);

  context.subscriptions.push(watcher);
  return watcher;
}

/** Clamp selectionRange inside fullRange for every DocumentSymbol (recursive). */
function fixDocumentSymbols(symbols: DocumentSymbol[]): void {
  for (const sym of symbols) {
    const full = sym.range;
    const sel = sym.selectionRange;
    if (
      sel.start.line < full.start.line ||
      (sel.start.line === full.start.line && sel.start.character < full.start.character)
    ) {
      sel.start = { ...full.start };
    }
    if (
      sel.end.line > full.end.line ||
      (sel.end.line === full.end.line && sel.end.character > full.end.character)
    ) {
      sel.end = { ...full.end };
    }
    if (sym.children) {
      fixDocumentSymbols(sym.children);
    }
  }
}

/** Convert LSP DocumentSymbol[] to vscode.DocumentSymbol[] after ranges are fixed. */
function toVscodeSymbols(symbols: DocumentSymbol[]): vscode.DocumentSymbol[] {
  return symbols.map((sym) => {
    const range = new vscode.Range(
      sym.range.start.line, sym.range.start.character,
      sym.range.end.line, sym.range.end.character,
    );
    const selRange = new vscode.Range(
      sym.selectionRange.start.line, sym.selectionRange.start.character,
      sym.selectionRange.end.line, sym.selectionRange.end.character,
    );
    const result = new vscode.DocumentSymbol(
      sym.name, sym.detail ?? "", sym.kind as unknown as vscode.SymbolKind, range, selRange,
    );
    if (sym.children) {
      result.children = toVscodeSymbols(sym.children);
    }
    return result;
  });
}

function binaryExists(binaryPath: string): boolean {
  try {
    if (path.isAbsolute(binaryPath)) {
      return fs.existsSync(binaryPath);
    }
    const cmd = platform() === "win32" ? "where" : "which";
    execFileSync(cmd, [binaryPath], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function goAvailable(): boolean {
  try {
    const cmd = platform() === "win32" ? "where" : "which";
    execFileSync(cmd, ["go"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function showBinaryNotFoundNotification(
  lspPath: string,
): Promise<void> {
  if (notificationShown) {
    return;
  }
  notificationShown = true;

  const action = await vscode.window.showWarningMessage(
    `Could not find starlark-lsp binary ("${lspPath}"). Install it for autocomplete, hover docs, and signature help.`,
    "Install",
    "Configure Path",
  );

  if (action === "Install") {
    if (goAvailable()) {
      const terminal = vscode.window.createTerminal("Install starlark-lsp");
      terminal.show();
      terminal.sendText(
        "go install github.com/tilt-dev/starlark-lsp@latest",
      );
    } else {
      await vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/tilt-dev/starlark-lsp"),
      );
    }
  } else if (action === "Configure Path") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "functionStarlark.lsp.path",
    );
  }
}

function createStatusBar(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    0,
  );
  item.command = "functionStarlark.showOutput";
  item.tooltip = "Function Starlark LSP";
  return item;
}

function updateStatusBarVisibility(): void {
  if (!statusBarItem) {
    return;
  }
  if (vscode.window.activeTextEditor?.document.languageId === "starlark") {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

async function startLsp(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("functionStarlark");

  if (!config.get<boolean>("lsp.enabled", true)) {
    if (statusBarItem) {
      statusBarItem.hide();
    }
    if (client) {
      await client.stop();
      client = undefined;
    }
    return;
  }

  const lspPath = config.get<string>("lsp.path", "starlark-lsp")!;

  if (!binaryExists(lspPath)) {
    void showBinaryNotFoundNotification(lspPath);
    if (statusBarItem) {
      statusBarItem.text = "$(x) Starlark";
      updateStatusBarVisibility();
    }
    return;
  }

  const builtinsPath = path.join(context.extensionPath, "starlark", "builtins.py");
  const schemaDir = getSchemaCachePath(context);
  fs.mkdirSync(schemaDir, { recursive: true });

  // Always include schema stub file in args — it may be empty initially
  // but will be populated after OCI download, and client.restart() reuses
  // the same args so the file must be present from the start.
  const schemaStubPath = path.join(schemaDir, "_schemas.py");
  if (!fs.existsSync(schemaStubPath)) {
    fs.writeFileSync(schemaStubPath, "# auto-generated schema stubs\n", "utf-8");
  }
  // Three --builtin-paths:
  // 1. builtins.py (file) — function-starlark builtins (global)
  // 2. _schemas.py (file) — flat schema stubs for direct imports (global)
  // 3. schemaDir (directory) — namespace module .py files (k8s.py → k8s.Deployment)
  const args = [
    "start",
    "--builtin-paths", builtinsPath,
    "--builtin-paths", schemaStubPath,
    "--builtin-paths", schemaDir,
  ];

  const serverOptions: ServerOptions = {
    command: lspPath,
    args,
  };

  // Build middleware: always include provideDocumentSymbols fix,
  // add scoping middleware when schemas are enabled
  const scopingMiddleware = schemaIndex
    ? createScopingMiddleware(schemaIndex, (uri) => {
        for (const doc of vscode.workspace.textDocuments) {
          if (doc.uri.toString() === uri) return doc.getText();
        }
        return undefined;
      })
    : undefined;

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "starlark" }],
    outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Error,
    connectionOptions: { maxRestartCount: 3 },
    middleware: {
      provideDocumentSymbols: async (document, token) => {
        // Bypass next() — it converts before we can fix ranges, and the
        // vscode.DocumentSymbol constructor rejects invalid selectionRange.
        // Instead: raw request → fix ranges → convert manually.
        if (!client || !client.isRunning()) {
          return undefined;
        }
        const result = await client.sendRequest<DocumentSymbol[] | null>(
          "textDocument/documentSymbol",
          { textDocument: { uri: document.uri.toString() } },
          token,
        );
        if (!result || !Array.isArray(result)) {
          return undefined;
        }
        fixDocumentSymbols(result);
        return toVscodeSymbols(result);
      },
      ...(scopingMiddleware as unknown as Partial<Middleware>),
      handleDiagnostics: (uri, diagnostics, next) => {
        // Filter out starlark-lsp "no such file or directory" errors for OCI load paths
        const filtered = diagnostics.filter(
          (d) => !d.message.includes("no such file or directory"),
        );
        next(uri, filtered);
      },
    },
  };

  client = new LanguageClient(
    "functionStarlark",
    "Function Starlark",
    serverOptions,
    clientOptions,
  );

  client.onDidChangeState((e) => {
    if (!statusBarItem) {
      return;
    }
    switch (e.newState) {
      case State.Running:
        statusBarItem.text = "$(check) Starlark";
        break;
      case State.Starting:
        statusBarItem.text = "$(sync~spin) Starlark";
        break;
      case State.Stopped:
        statusBarItem.text = "$(x) Starlark";
        break;
    }
    updateStatusBarVisibility();
  });

  if (statusBarItem) {
    statusBarItem.text = "$(sync~spin) Starlark";
    updateStatusBarVisibility();
  }

  await client.start();

  context.subscriptions.push(client);
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Function Starlark LSP", {
    log: true,
  });

  const formatter = new BuildifierFormatProvider(outputChannel);
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { scheme: "file", language: "starlark" },
      formatter,
    ),
  );

  statusBarItem = createStatusBar();

  context.subscriptions.push(
    vscode.commands.registerCommand("functionStarlark.showOutput", () => {
      if (outputChannel) {
        outputChannel.show();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "functionStarlark.restartServer",
      async () => {
        if (client && client.isRunning()) {
          vscode.window.showInformationMessage("Restarting Starlark LSP...");
          await client.restart();
        } else {
          await startLsp(context);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (
        !e.affectsConfiguration("functionStarlark.lsp.path") &&
        !e.affectsConfiguration("functionStarlark.lsp.enabled") &&
        !e.affectsConfiguration("functionStarlark.schemas.path") &&
        !e.affectsConfiguration("functionStarlark.schemas.registry") &&
        !e.affectsConfiguration("functionStarlark.schemas.enabled")
      ) {
        return;
      }

      if (e.affectsConfiguration("functionStarlark.schemas.registry")) {
        const cfg = vscode.workspace.getConfiguration("functionStarlark");
        const registry = cfg.get<string>("schemas.registry", "ghcr.io/wompipomp")!;
        const cacheDir = getSchemaCachePath(context);
        downloader = new OciDownloader(cacheDir, registry, outputChannel);
        return;
      }

      if (e.affectsConfiguration("functionStarlark.schemas.path")) {
        schemaWatcher?.dispose();
        if (client) {
          await client.stop();
          client = undefined;
        }
        await startLsp(context);
        schemaWatcher = setupSchemaWatcher(context);
        return;
      }

      const cfg = vscode.workspace.getConfiguration("functionStarlark");
      if (!cfg.get<boolean>("lsp.enabled", true)) {
        if (client) {
          await client.stop();
          client = undefined;
        }
        if (statusBarItem) {
          statusBarItem.hide();
        }
        return;
      }

      if (client) {
        vscode.window.showInformationMessage("Restarting Starlark LSP...");
        await client.restart();
      } else {
        await startLsp(context);
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateStatusBarVisibility();
    }),
  );

  context.subscriptions.push(statusBarItem);

  // Initialize schema modules when enabled
  const config = vscode.workspace.getConfiguration("functionStarlark");
  if (config.get<boolean>("schemas.enabled", true)) {
    const cacheDir = getSchemaCachePath(context);
    const registry = config.get<string>("schemas.registry", "ghcr.io/wompipomp")!;
    schemaIndex = new SchemaIndex();
    schemaIndex.buildFromCache(cacheDir);
    downloader = new OciDownloader(cacheDir, registry, outputChannel);
    // Ensure stub file exists for any previously cached schemas
    generateStubFile(cacheDir);
  }

  await startLsp(context);
  schemaWatcher = setupSchemaWatcher(context);

  // Register document open/save/close handlers for schema integration
  if (schemaIndex) {
    async function handleDocumentForSchemas(document: vscode.TextDocument) {
      if (document.languageId !== "starlark" || !downloader || !schemaIndex) return;
      const text = document.getText();
      const loads = parseLoadStatements(text);

      // Trigger downloads for uncached OCI refs
      for (const load of loads) {
        if (statusBarItem) {
          statusBarItem.text = `$(sync~spin) Starlark: pulling ${load.ociRef}...`;
        }
        downloader.ensureArtifact(load.ociRef).then(() => {
          const cacheDir = getSchemaCachePath(context);
          schemaIndex!.rebuild(cacheDir);
          // Generate flat stub file for direct imports
          generateStubFile(cacheDir);
          // Generate namespace module stubs from load statements in all open documents
          const nsFiles = collectNamespaceFiles(context);
          if (nsFiles.size > 0) {
            generateNamespaceStubs(cacheDir, nsFiles);
          }
          updateDocumentImports(document.uri.toString(), text, schemaIndex!);
          diagnosticProvider?.updateDiagnostics(document);
          if (statusBarItem) {
            statusBarItem.text = client?.isRunning() ? "$(check) Starlark" : "$(x) Starlark";
          }
        }).catch(() => {
          // Download failure logged by downloader
          if (statusBarItem) {
            statusBarItem.text = client?.isRunning() ? "$(check) Starlark" : "$(x) Starlark";
          }
        });
      }

      // Update document imports cache for middleware filtering
      updateDocumentImports(document.uri.toString(), text, schemaIndex!);
      // Update diagnostics
      diagnosticProvider?.updateDiagnostics(document);
    }

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(handleDocumentForSchemas),
      vscode.workspace.onDidSaveTextDocument(handleDocumentForSchemas),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        clearDocumentImports(doc.uri.toString());
      }),
    );

    // Register diagnostics provider
    const diagCollection = vscode.languages.createDiagnosticCollection("functionStarlark");
    diagnosticProvider = new MissingImportDiagnosticProvider(schemaIndex, diagCollection);
    context.subscriptions.push(diagCollection);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { scheme: "file", language: "starlark" },
        diagnosticProvider,
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
      ),
    );
  }

  // Register Clear Schema Cache command
  context.subscriptions.push(
    vscode.commands.registerCommand("functionStarlark.clearSchemaCache", async () => {
      const cacheDir = getSchemaCachePath(context);
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
      await fs.promises.mkdir(cacheDir, { recursive: true });
      schemaIndex?.rebuild(cacheDir);
      if (client?.isRunning()) await client.restart();
      vscode.window.showInformationMessage("Schema cache cleared.");
    }),
  );
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
