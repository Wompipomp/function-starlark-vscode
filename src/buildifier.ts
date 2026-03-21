import * as fs from "fs";
import * as path from "path";
import { execFileSync, spawn } from "child_process";
import { platform } from "os";

import * as vscode from "vscode";

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

export class BuildifierFormatProvider
  implements vscode.DocumentFormattingEditProvider
{
  private logged = false;

  constructor(private outputChannel: vscode.LogOutputChannel) {}

  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ): Promise<vscode.TextEdit[]> {
    const config = vscode.workspace.getConfiguration("functionStarlark");
    const buildifierPath = config.get<string>(
      "buildifier.path",
      "buildifier",
    )!;

    if (!binaryExists(buildifierPath)) {
      if (!this.logged) {
        this.outputChannel.warn(
          `Buildifier not found at "${buildifierPath}". Formatting is disabled.`,
        );
        this.logged = true;
      }
      return [];
    }

    const args = [
      "--mode=fix",
      "--type=bzl",
      `--path=${document.fileName}`,
    ];

    if (config.get<boolean>("buildifier.fixLintOnFormat", false)) {
      args.push("--lint=fix");
    }

    const content = document.getText();

    try {
      const stdout = await this.runBuildifier(buildifierPath, args, content);

      if (stdout === content) {
        return [];
      }

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(content.length),
      );
      return [vscode.TextEdit.replace(fullRange, stdout)];
    } catch (error) {
      this.outputChannel.error("Buildifier formatting failed", error);
      return [];
    }
  }

  private runBuildifier(
    binaryPath: string,
    args: string[],
    input: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      child.on("error", reject);

      child.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks).toString());
        } else {
          const stderr = Buffer.concat(stderrChunks).toString();
          reject(new Error(`buildifier exited with code ${code}: ${stderr}`));
        }
      });

      child.stdin.write(input);
      child.stdin.end();
    });
  }
}
