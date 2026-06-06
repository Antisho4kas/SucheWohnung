import {
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./errors.filter";

function createHost(exceptionUrl = "/api/v1/profiles") {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({
          method: "POST",
          url: exceptionUrl,
          headers: { "x-request-id": "req-1" },
        }),
      }),
    },
    status,
    json,
  };
}

describe("AllExceptionsFilter contract", () => {
  it("wraps validation exceptions in the API error envelope", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();
    const details = [{ field: "price_max", issue: "must be > price_min" }];

    filter.catch(
      new BadRequestException({ message: "Invalid payload", details }),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details,
        request_id: "req-1",
      },
    });
  });

  it("keeps array validation messages in details and exposes a string message", () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = createHost();

    filter.catch(
      new BadRequestException(["email must be an email"]),
      host as never,
    );

    expect(json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: ["email must be an email"],
        request_id: "req-1",
      },
    });
  });

  it("copies nestjs-zod validation errors into details", () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = createHost();
    const errors = [{ path: ["email"], message: "Invalid email" }];

    filter.catch(
      new BadRequestException({ message: "Validation failed", errors }),
      host as never,
    );

    expect(json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: errors,
        request_id: "req-1",
      },
    });
  });

  it("does not expose internal server error messages", () => {
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error("internal diagnostic details"), host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL",
        message: "Internal server error",
        details: undefined,
        request_id: "req-1",
      },
    });
    expect(logger).toHaveBeenCalledWith(
      "POST /api/v1/profiles → 500: internal diagnostic details",
    );
  });

  it("does not expose 5xx HttpException messages or details", () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    filter.catch(
      new HttpException(
        {
          message: "Prisma P1001 database host password=secret",
          details: { dsn: "postgres://secret" },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL",
        message: "Internal server error",
        details: undefined,
        request_id: "req-1",
      },
    });

    const { host: host2, json: json2 } = createHost();
    filter.catch(
      new InternalServerErrorException("internal diagnostic details"),
      host2 as never,
    );

    expect(json2).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL",
        message: "Internal server error",
        details: undefined,
        request_id: "req-1",
      },
    });
  });

  it("redacts known secret patterns before writing 500 logs", () => {
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host } = createHost();

    filter.catch(
      new Error(
        "DATABASE_URL=postgresql://app:secret@db/suchewohnung password=secret token=abc123 Authorization: Bearer jwt.secret",
      ),
      host as never,
    );

    const logged = String(logger.mock.calls.at(-1)?.[0] ?? "");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("abc123");
    expect(logged).not.toContain("jwt.secret");
    expect(logged).toContain("[REDACTED]");
  });

  it("redacts secret query parameters from 500 log URLs", () => {
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host } = createHost(
      "/api/v1/listings?access_token=jwt.secret&refresh_token=refresh.secret",
    );

    filter.catch(new Error("internal diagnostic details"), host as never);

    const logged = String(logger.mock.calls.at(-1)?.[0] ?? "");
    expect(logged).not.toContain("jwt.secret");
    expect(logged).not.toContain("refresh.secret");
    expect(logged).toContain("[REDACTED]");
  });

  it("redacts JSON secrets, Basic auth, cookies, credential URLs, and email query params", () => {
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host } = createHost("/api/v1/admin/logs?q=user@example.com");

    filter.catch(
      new Error(
        '{"password":"json-secret","cookie":"sid=abc"} Authorization: Basic dXNlcjpwYXNz SMTP_URL=smtp://user:pass@mail.local DATABASE_URL=postgresql://app:dbpass@db/suchewohnung',
      ),
      host as never,
    );

    const logged = String(logger.mock.calls.at(-1)?.[0] ?? "");
    expect(logged).not.toContain("user@example.com");
    expect(logged).not.toContain("json-secret");
    expect(logged).not.toContain("sid=abc");
    expect(logged).not.toContain("dXNlcjpwYXNz");
    expect(logged).not.toContain("user:pass@mail.local");
    expect(logged).not.toContain("app:dbpass@db");
    expect(logged).toContain("[REDACTED]");
  });
});
