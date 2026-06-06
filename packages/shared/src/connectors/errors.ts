import type { ZodError } from "zod";

export type ConnectorErrorKind =
  | "config"
  | "http"
  | "timeout"
  | "abort"
  | "network"
  | "extraction"
  | "browser_unavailable";

export class ConnectorError extends Error {
  readonly kind: ConnectorErrorKind;
  override readonly cause?: unknown;

  constructor(kind: ConnectorErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "ConnectorError";
    this.kind = kind;
    this.cause = cause;
  }
}

export class ConnectorConfigError extends ConnectorError {
  readonly issues?: ZodError["issues"];

  constructor(connectorSlug: string, cause: ZodError) {
    super("config", `Invalid connector config for ${connectorSlug}`, cause);
    this.name = "ConnectorConfigError";
    this.issues = cause.issues;
  }
}

export class ConnectorHttpError extends ConnectorError {
  readonly status: number;
  readonly url: string;
  readonly body?: string;

  constructor(url: string, status: number, body?: string) {
    super("http", `HTTP ${status} for ${url}`);
    this.name = "ConnectorHttpError";
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

export class ConnectorTimeoutError extends ConnectorError {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number, cause?: unknown) {
    super(
      "timeout",
      `HTTP request timed out after ${timeoutMs}ms: ${url}`,
      cause,
    );
    this.name = "ConnectorTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export class ConnectorAbortError extends ConnectorError {
  readonly url?: string;

  constructor(
    message = "Connector operation aborted",
    url?: string,
    cause?: unknown,
  ) {
    super("abort", message, cause);
    this.name = "ConnectorAbortError";
    this.url = url;
  }
}

export class ConnectorNetworkError extends ConnectorError {
  readonly url: string;

  constructor(url: string, cause: unknown) {
    super(
      "network",
      `Network error for ${url}: ${stringifyError(cause)}`,
      cause,
    );
    this.name = "ConnectorNetworkError";
    this.url = url;
  }
}

export class ConnectorExtractionError extends ConnectorError {
  readonly selector?: string;

  constructor(message: string, selector?: string, cause?: unknown) {
    super("extraction", message, cause);
    this.name = "ConnectorExtractionError";
    this.selector = selector;
  }
}

export class ConnectorBrowserUnavailableError extends ConnectorError {
  constructor(message = "Browser pool is not configured") {
    super("browser_unavailable", message);
    this.name = "ConnectorBrowserUnavailableError";
  }
}

export function isConnectorAbortError(error: unknown): boolean {
  return (
    error instanceof ConnectorAbortError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { readonly name?: unknown }).name === "AbortError")
  );
}

export function rethrowConnectorAbort(error: unknown): void {
  if (isConnectorAbortError(error)) throw error;
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
