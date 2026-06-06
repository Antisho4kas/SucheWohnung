import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/** Unified error envelope (§08.4). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers["x-request-id"] as string) ?? "";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL";
    let message = "Internal server error";
    let logMessage = message;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = mapStatusToCode(status);
      logMessage = exception.message;
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        message = typeof b.message === "string" ? b.message : exception.message;
        if (Array.isArray(b.message)) {
          message = "Validation failed";
        }
        details =
          b.details ??
          b.errors ??
          (Array.isArray(b.message) ? b.message : undefined);
      }
    } else if (exception instanceof Error) {
      logMessage = exception.message;
    }

    if (status >= 500) {
      code = "INTERNAL";
      message = "Internal server error";
      details = undefined;
    }

    if (status >= 500) {
      this.logger.error(sanitizeLogMessage(`${req.method} ${req.url} → ${status}: ${logMessage}`));
    }

    res.status(status).json({
      error: { code, message, details, request_id: requestId },
    });
  }
}

export function sanitizeLogMessage(message: string): string {
  return message
    .replace(/(["']?\b(?:password|passwd|pwd|(?:access|refresh|id)?[_-]?token|secret|api[_-]?key|authorization|cookie|database[_-]?url|dsn|email|q)\b["']?\s*[:=]\s*["']?)(?:(?:Bearer|Basic)\s+)?[^\s,"';&}]+/gi, "$1[REDACTED]")
    .replace(/\b(?:postgres(?:ql)?|mysql|redis|smtp|amqps?|mongodb(?:\+srv)?|https?):\/\/[^\s,;@]+:[^\s,;@]+@[^\s,;]+/gi, (value) => {
      const scheme = value.split("://", 1)[0];
      return `${scheme}://[REDACTED]`;
    })
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=-]+/gi, "Basic [REDACTED]")
    .replace(/\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s,;]+/gi, (value) => {
      const scheme = value.split("://", 1)[0];
      return `${scheme}://[REDACTED]`;
    });
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "SERVICE_UNAVAILABLE";
    default:
      return "INTERNAL";
  }
}
