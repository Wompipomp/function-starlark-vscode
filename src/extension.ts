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
import { SchemaIndex, loadBuiltinModuleDocs } from "./schema-index";
import { createScopingMiddleware, updateDocumentImports, clearDocumentImports, clearAllDocumentImports } from "./middleware";
import { MissingImportDiagnosticProvider } from "./diagnostics";
import { TypeWarningProvider } from "./type-warning-provider";
import { MissingFieldQuickFixProvider } from "./missing-field-fix";
import { generateStubFile, generateNamespaceStubs } from "./schema-stubs";
import { isLspNoiseDiagnostic } from "./lsp-diagnostic-filter";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.LogOutputChannel | undefined;
let notificationShown = false;
let schemaWatcher: vscode.FileSystemWatcher | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let schemaIndex: SchemaIndex | undefined;
let downloader: OciDownloader | undefined;
let diagnosticProvider: MissingImportDiagnosticProvider | undefined;
let typeWarningProvider: TypeWarningProvider | undefined;
let missingFieldFixProvider: MissingFieldQuickFixProvider | undefined;
let typeCheckTimer: ReturnType<typeof setTimeout> | undefined;
let schemaDisposables: vscode.Disposable[] = [];
let configDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let schemaGeneration = 0;

export function getSchemaGeneration(): number {
  return schemaGeneration;
}

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
  // Watch __init__.py and root-level *.py (namespace modules like k8s.py).
  // NOT recursive — avoids restarts from .star extraction in subdirectories.
  const pattern = new vscode.RelativePattern(
    vscode.Uri.file(schemaDir),
    "*.py",
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
    }, 1000);
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
        "go install github.com/tilt-dev/starlark-lsp/cmd/starlark-lsp@latest",
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

  const builtinsDir = path.join(context.extensionPath, "starlark");
  const args = ["start", "--builtin-paths", builtinsDir];

  if (config.get<boolean>("schemas.enabled", true)) {
    const schemaDir = getSchemaCachePath(context);
    fs.mkdirSync(schemaDir, { recursive: true });

    // Create __init__.py for flat schema stubs — starlark-lsp treats this as
    // root-level (global) builtins when the directory is passed as --builtin-paths.
    // Namespace modules (k8s.py) become k8s.Deployment() in the same directory.
    const initPath = path.join(schemaDir, "__init__.py");
    if (!fs.existsSync(initPath)) {
      fs.writeFileSync(initPath, "# auto-generated schema stubs\n", "utf-8");
    }
    args.push("--builtin-paths", schemaDir);
  }

  const serverOptions: ServerOptions = {
    command: lspPath,
    args,
  };

  // Build middleware: always include provideDocumentSymbols fix,
  // add scoping middleware when schemas are enabled
  const moduleDocs = loadBuiltinModuleDocs(builtinsDir);
  const scopingMiddleware = schemaIndex
    ? createScopingMiddleware(schemaIndex, (uri) => {
        for (const doc of vscode.workspace.textDocuments) {
          if (doc.uri.toString() === uri) return doc.getText();
        }
        return undefined;
      }, moduleDocs)
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
        const filtered = diagnostics.filter(
          (d) => !isLspNoiseDiagnostic(d.message),
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

function initSchemaSubsystem(context: vscode.ExtensionContext): void {
  const cacheDir = getSchemaCachePath(context);
  const config = vscode.workspace.getConfiguration("functionStarlark");
  const registry = config.get<string>("schemas.registry", "ghcr.io/wompipomp")!;
  const currentGeneration = schemaGeneration;

  schemaIndex = new SchemaIndex();
  schemaIndex.buildFromCache(cacheDir);
  downloader = new OciDownloader(cacheDir, registry, outputChannel);
  generateStubFile(cacheDir);
  schemaWatcher = setupSchemaWatcher(context);

  const currentSchemaIndex = schemaIndex;
  const currentDownloader = downloader;

  async function handleDocumentForSchemas(document: vscode.TextDocument) {
    if (document.languageId !== "starlark" || !currentDownloader || !currentSchemaIndex) return;
    const text = document.getText();
    const loads = parseLoadStatements(text);

    for (const load of loads) {
      if (statusBarItem) {
        statusBarItem.text = `$(sync~spin) Starlark: pulling ${load.ociRef}...`;
      }
      currentDownloader.ensureArtifact(load.ociRef).then(() => {
        if (schemaGeneration !== currentGeneration) {
          outputChannel?.info(`Discarding download for ${load.ociRef} (config changed)`);
          return;
        }
        const dir = getSchemaCachePath(context);
        currentSchemaIndex.rebuild(dir);
        generateStubFile(dir);
        const nsFiles = collectNamespaceFiles(context);
        if (nsFiles.size > 0) {
          generateNamespaceStubs(dir, nsFiles);
        }
        updateDocumentImports(document.uri.toString(), text, currentSchemaIndex);
        diagnosticProvider?.updateDiagnostics(document);
        typeWarningProvider?.updateDiagnostics(document);
        if (statusBarItem) {
          statusBarItem.text = client?.isRunning() ? "$(check) Starlark" : "$(x) Starlark";
        }
      }).catch(() => {
        if (statusBarItem) {
          statusBarItem.text = client?.isRunning() ? "$(check) Starlark" : "$(x) Starlark";
        }
      });
    }

    updateDocumentImports(document.uri.toString(), text, currentSchemaIndex);
    diagnosticProvider?.updateDiagnostics(document);
    typeWarningProvider?.updateDiagnostics(document);
  }

  const openHandler = vscode.workspace.onDidOpenTextDocument(handleDocumentForSchemas);
  const saveHandler = vscode.workspace.onDidSaveTextDocument(handleDocumentForSchemas);
  const closeHandler = vscode.workspace.onDidCloseTextDocument((doc) => {
    clearDocumentImports(doc.uri.toString());
  });
  schemaDisposables.push(openHandler, saveHandler, closeHandler);

  const diagCollection = vscode.languages.createDiagnosticCollection("functionStarlark");
  diagnosticProvider = new MissingImportDiagnosticProvider(currentSchemaIndex, diagCollection);
  const codeActionReg = vscode.languages.registerCodeActionsProvider(
    { scheme: "file", language: "starlark" },
    diagnosticProvider,
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );
  schemaDisposables.push(diagCollection, codeActionReg);

  // Type warning provider — separate DiagnosticCollection for type-checking warnings
  typeWarningProvider = new TypeWarningProvider(currentSchemaIndex);
  schemaDisposables.push(typeWarningProvider);

  // Quick fix provider for missing required fields
  missingFieldFixProvider = new MissingFieldQuickFixProvider(currentSchemaIndex);
  const missingFieldFixReg = vscode.languages.registerCodeActionsProvider(
    { scheme: "file", language: "starlark" },
    missingFieldFixProvider,
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );
  schemaDisposables.push(missingFieldFixReg);

  // Debounced onDidChangeTextDocument handler for real-time type checking
  const typeCheckChangeHandler = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId !== "starlark") return;
    if (typeCheckTimer) clearTimeout(typeCheckTimer);
    typeCheckTimer = setTimeout(() => {
      typeCheckTimer = undefined;
      typeWarningProvider?.updateDiagnostics(e.document);
    }, 500);
  });
  schemaDisposables.push(typeCheckChangeHandler);

  // Immediate type checking on document open
  const typeCheckOpenHandler = vscode.workspace.onDidOpenTextDocument((doc) => {
    if (doc.languageId !== "starlark") return;
    typeWarningProvider?.updateDiagnostics(doc);
  });
  schemaDisposables.push(typeCheckOpenHandler);

  // Scan all currently open starlark documents
  vscode.workspace.textDocuments
    .filter((d) => d.languageId === "starlark")
    .forEach(handleDocumentForSchemas);
}

function teardownSchemaSubsystem(): void {
  if (typeCheckTimer) {
    clearTimeout(typeCheckTimer);
    typeCheckTimer = undefined;
  }
  schemaWatcher?.dispose();
  schemaWatcher = undefined;
  diagnosticProvider?.dispose();
  diagnosticProvider = undefined;
  typeWarningProvider = undefined; // disposal handled by schemaDisposables loop
  missingFieldFixProvider = undefined;
  schemaIndex = undefined;
  downloader = undefined;
  for (const d of schemaDisposables) {
    d.dispose();
  }
  schemaDisposables = [];
  clearAllDocumentImports();
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

      if (e.affectsConfiguration("functionStarlark.schemas.path") ||
          e.affectsConfiguration("functionStarlark.schemas.registry")) {
        if (configDebounceTimer) {
          clearTimeout(configDebounceTimer);
        }
        configDebounceTimer = setTimeout(async () => {
          configDebounceTimer = undefined;
          schemaGeneration++;
          teardownSchemaSubsystem();
          if (statusBarItem) {
            statusBarItem.text = "$(sync~spin) Starlark: Reloading schemas...";
            statusBarItem.backgroundColor = undefined;
          }
          try {
            initSchemaSubsystem(context);
            if (client) {
              await client.stop();
              client = undefined;
            }
            await startLsp(context);
            if (statusBarItem) {
              statusBarItem.text = "$(check) Starlark: Schemas reloaded";
              statusBarItem.backgroundColor = undefined;
              setTimeout(() => {
                if (statusBarItem) {
                  statusBarItem.text = client?.isRunning()
                    ? "$(check) Starlark"
                    : "$(x) Starlark";
                }
              }, 2000);
            }
          } catch (err) {
            outputChannel?.error("Schema reinit failed", err);
            if (statusBarItem) {
              statusBarItem.text = "$(warning) Starlark: Schema error";
              statusBarItem.backgroundColor = new vscode.ThemeColor(
                "statusBarItem.warningBackground"
              );
            }
          }
        }, 500);
        return;
      }

      if (e.affectsConfiguration("functionStarlark.schemas.enabled")) {
        const cfg = vscode.workspace.getConfiguration("functionStarlark");
        const enabled = cfg.get<boolean>("schemas.enabled", true);
        if (!enabled) {
          teardownSchemaSubsystem();
        } else {
          initSchemaSubsystem(context);
        }
        if (client) {
          await client.stop();
          client = undefined;
        }
        await startLsp(context);
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
    initSchemaSubsystem(context);
  }

  await startLsp(context);

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
  teardownSchemaSubsystem();
  if (configDebounceTimer) {
    clearTimeout(configDebounceTimer);
    configDebounceTimer = undefined;
  }
  if (client) {
    await client.stop();
  }
}
