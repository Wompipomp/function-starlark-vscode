import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("functionStarlark");

  if (!config.get<boolean>("lsp.enabled", true)) {
    return;
  }

  const lspPath = config.get<string>("lsp.path", "starlark-lsp");
  const builtinsPath = path.join(
    context.extensionPath,
    "starlark",
    "builtins.py"
  );

  const serverOptions: ServerOptions = {
    command: lspPath,
    args: ["start", "--builtin-paths", builtinsPath],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "starlark" }],
  };

  client = new LanguageClient(
    "functionStarlark",
    "Function Starlark",
    serverOptions,
    clientOptions
  );

  try {
    await client.start();
  } catch {
    const install = "Install starlark-lsp";
    const action = await vscode.window.showWarningMessage(
      `Could not start starlark-lsp (looked for "${lspPath}"). Install it for autocomplete and hover docs.`,
      install
    );
    if (action === install) {
      const terminal = vscode.window.createTerminal("Install starlark-lsp");
      terminal.show();
      terminal.sendText(
        "go install github.com/tilt-dev/starlark-lsp@latest"
      );
    }
  }
}

export async function deactivate() {
  if (client) {
    await client.stop();
  }
}
