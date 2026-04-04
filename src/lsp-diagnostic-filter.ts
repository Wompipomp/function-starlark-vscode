/**
 * Patterns matching starlark-lsp diagnostic messages that are noise
 * for OCI-protocol load statements and should be suppressed.
 */
export const LSP_NOISE_PATTERNS: readonly string[] = [
  "no such file or directory",
  "only file URIs are supported",
];

/**
 * Returns true if the diagnostic message matches a known starlark-lsp
 * noise pattern that should be filtered from the user's view.
 */
export function isLspNoiseDiagnostic(message: string): boolean {
  return LSP_NOISE_PATTERNS.some((pattern) => message.includes(pattern));
}
