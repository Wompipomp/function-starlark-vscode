import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { platform } from "os";

import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  State,
} from "vscode-languageclient/node";
import type { DocumentSymbol } from "vscode-languageserver-types";
import { BuildifierFormatProvider } from "./buildifier";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.LogOutputChannel | undefined;
let notificationShown = false;
let schemaWatcher: vscode.FileSystemWatcher | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function getSchemaCachePath(context: vscode.ExtensionContext): string {
  const config = vscode.workspace.getConfiguration("functionStarlark");
  const override = config.get<string>("schemas.path", "");
  if (override) {
    return override;
  }
  return context.globalStorageUri.fsPath;
}

export function setupSchemaWatcher(
  context: vscode.ExtensionContext,
): vscode.FileSystemWatcher {
  const schemaDir = getSchemaCachePath(context);
  const pattern = new vscode.RelativePattern(
    vscode.Uri.file(schemaDir),
    "**/*.py",
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

  const serverOptions: ServerOptions = {
    command: lspPath,
    args: ["start", "--builtin-paths", builtinsPath, "--builtin-paths", schemaDir],
  };

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
        !e.affectsConfiguration("functionStarlark.schemas.path")
      ) {
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

      const config = vscode.workspace.getConfiguration("functionStarlark");
      if (!config.get<boolean>("lsp.enabled", true)) {
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

  await startLsp(context);
  schemaWatcher = setupSchemaWatcher(context);
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
