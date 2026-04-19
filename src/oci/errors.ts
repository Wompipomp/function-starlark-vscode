/**
 * Typed errors for OCI artifact downloads.
 *
 * The extension layer needs to distinguish authentication failures from
 * generic network/registry errors so it can word user-facing messages
 * correctly (e.g. "authentication required for registry.example.com" vs
 * "could not reach registry"). Parsing error message strings is fragile,
 * so the OCI client throws OciDownloadError with a classified `kind`.
 */

/**
 * Classification of a failed OCI download attempt.
 *
 * - `auth`: registry rejected credentials (401 after token exchange, 403 on
 *   manifest/blob). User action: check Docker login / credential helper.
 * - `notFound`: registry returned 404 — artifact or tag does not exist at
 *   the given repository.
 * - `network`: fetch itself failed (DNS, connection refused, TLS, timeout).
 *   User action: check network / VPN.
 * - `other`: registry returned some other non-2xx, or an unexpected error
 *   occurred during extraction. Fall-through catch-all.
 */
export type OciErrorKind = "auth" | "notFound" | "network" | "other";

/**
 * Error thrown by the OCI client and downloader when an artifact pull fails.
 *
 * Carries enough context for the UI layer to build a precise message
 * ("authentication required for <host>") without having to reparse
 * message strings.
 */
export class OciDownloadError extends Error {
  readonly kind: OciErrorKind;
  readonly httpStatus?: number;
  readonly registryHost: string;
  readonly repository: string;
  readonly tag: string;

  constructor(args: {
    kind: OciErrorKind;
    message: string;
    registryHost: string;
    repository: string;
    tag: string;
    httpStatus?: number;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = "OciDownloadError";
    this.kind = args.kind;
    this.httpStatus = args.httpStatus;
    this.registryHost = args.registryHost;
    this.repository = args.repository;
    this.tag = args.tag;
    // Assign cause after super() so this compiles under ES2020 targets that
    // don't know about the ES2022 `ErrorOptions` overload.
    if (args.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = args.cause;
    }
  }

  /** Full reference for diagnostic messages: `host/repo:tag`. */
  get reference(): string {
    return `${this.registryHost}/${this.repository}:${this.tag}`;
  }
}

/**
 * Classify an HTTP status code from a registry response into an OciErrorKind.
 *
 * Used by the client after a fetch that already went through the 401 token-
 * exchange flow — so a 401 that reaches this point means auth truly failed.
 */
export function classifyHttpStatus(status: number): OciErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "notFound";
  return "other";
}

/**
 * Wrap an unknown thrown value (typically from a fetch() rejection) as an
 * OciDownloadError with kind="network". Preserves the original error as
 * `cause` for the output channel.
 */
export function wrapNetworkError(
  err: unknown,
  ctx: { registryHost: string; repository: string; tag: string },
): OciDownloadError {
  const msg = err instanceof Error ? err.message : String(err);
  return new OciDownloadError({
    kind: "network",
    message: `Network error reaching ${ctx.registryHost}: ${msg}`,
    registryHost: ctx.registryHost,
    repository: ctx.repository,
    tag: ctx.tag,
    cause: err,
  });
}
