import request from "supertest";
import { UnauthorizedException } from "@nestjs/common";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type ApiE2eHarness = Awaited<
  ReturnType<
    (typeof import("./test/api-e2e-harness.js"))["createApiE2eHarness"]
  >
>;

describe("API e2e harness", () => {
  let harness: ApiE2eHarness;

  beforeAll(async () => {
    vi.stubEnv("JWT_DEV_SECRET", "test-dev-secret-with-at-least-32-chars");
    const { createApiE2eHarness } = await import("./test/api-e2e-harness.js");
    harness = await createApiE2eHarness();
  });

  afterAll(async () => {
    await harness.app.close();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setCookies(response: request.Response): string[] {
    const header = response.headers["set-cookie"];
    if (!header) return [];
    return Array.isArray(header) ? header : [header];
  }

  it("serves health without touching Redis or Postgres", async () => {
    const response = await request(harness.app.getHttpServer())
      .get("/health")
      .expect(200);

    expect(response.body).toMatchObject({ status: "ok" });
    expect(harness.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("uses mocked Prisma for readiness checks", async () => {
    await request(harness.app.getHttpServer())
      .get("/ready")
      .expect(200)
      .expect({ status: "ready" });

    harness.prisma.$queryRaw.mockRejectedValueOnce(new Error("db down"));

    await request(harness.app.getHttpServer())
      .get("/ready")
      .expect(200)
      .expect({ status: "not_ready" });
  });

  it("wraps public validation errors in the API error envelope", async () => {
    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("x-request-id", "req-e2e-1")
      .send({ email: "not-an-email", password: "" })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        request_id: "req-e2e-1",
      },
    });
    expect(response.body.error.details).toBeDefined();
  });

  it("registers pending users without returning auth tokens", async () => {
    harness.auth.register.mockResolvedValueOnce({ id: "user-1" });
    harness.auth.generateVerificationToken.mockResolvedValueOnce(
      "verify-token",
    );

    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "pending@example.com", password: "secret123" })
      .expect(201);

    expect(response.body).toEqual({ id: "user-1" });
    expect(response.body).not.toHaveProperty("access_token");
    expect(response.body).not.toHaveProperty("refresh_token");
    expect(harness.auth.register).toHaveBeenCalledWith(
      "pending@example.com",
      "secret123",
      undefined,
    );
  });

  it("maps pending-user login rejection to a clear auth error", async () => {
    harness.auth.login.mockRejectedValueOnce(
      new UnauthorizedException("Email verification required"),
    );

    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "pending@example.com", password: "secret123" })
      .expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: "UNAUTHENTICATED",
        message: "Email verification required",
      },
    });
  });

  it("logs in active users with access JSON and httpOnly refresh cookie", async () => {
    harness.auth.login.mockResolvedValueOnce({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });

    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "active@example.com", password: "secret123" })
      .expect(200);

    expect(response.body).toEqual({ access_token: "access-token" });
    expect(response.body).not.toHaveProperty("refresh_token");
    expect(setCookies(response).join("; ")).toContain(
      "sw_refresh=refresh-token",
    );
    expect(setCookies(response).join("; ")).toContain("HttpOnly");
    expect(setCookies(response).join("; ")).toContain("SameSite=Strict");
    expect(setCookies(response).join("; ")).toContain("Path=/api/v1/auth");
  });

  it("refreshes from the httpOnly refresh cookie and rotates the cookie", async () => {
    harness.auth.refresh.mockResolvedValueOnce({
      access_token: "next-access-token",
      refresh_token: "next-refresh-token",
    });

    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", "sw_refresh=old-refresh-token")
      .send({})
      .expect(200);

    expect(harness.auth.refresh).toHaveBeenCalledWith("old-refresh-token");
    expect(response.body).toEqual({ access_token: "next-access-token" });
    expect(response.body).not.toHaveProperty("refresh_token");
    expect(setCookies(response).join("; ")).toContain(
      "sw_refresh=next-refresh-token",
    );
    expect(setCookies(response).join("; ")).toContain("HttpOnly");
  });

  it("rejects refresh requests without cookie or body refresh token", async () => {
    await request(harness.app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({})
      .expect(401);

    expect(harness.auth.refresh).not.toHaveBeenCalled();
  });

  it("logs out by revoking the cookie refresh token and clearing the cookie", async () => {
    harness.auth.logout.mockResolvedValueOnce(undefined);

    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", "sw_refresh=old-refresh-token")
      .send({})
      .expect(200);

    expect(harness.auth.logout).toHaveBeenCalledWith("old-refresh-token");
    expect(response.body).toEqual({ ok: true });
    expect(setCookies(response).join("; ")).toContain("sw_refresh=");
    expect(setCookies(response).join("; ")).toContain("Path=/api/v1/auth");
  });

  it("wraps unauthorized webhook errors in the API error envelope", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected-secret");
    const response = await request(harness.app.getHttpServer())
      .post("/api/v1/telegram/webhook")
      .set("x-request-id", "req-e2e-2")
      .set("x-telegram-bot-api-secret-token", "wrong-secret")
      .send({ update_id: 1 })
      .expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: "UNAUTHENTICATED",
        request_id: "req-e2e-2",
      },
    });
    expect(harness.queue.enqueueTelegramUpdate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("enqueues Telegram webhook updates through the mocked queue", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected-secret");
    try {
      await request(harness.app.getHttpServer())
        .post("/api/v1/telegram/webhook")
        .set("x-telegram-bot-api-secret-token", "expected-secret")
        .send({ update_id: 1 })
        .expect(200)
        .expect({ ok: true });

      expect(harness.queue.enqueueTelegramUpdate).toHaveBeenCalledWith({
        update_id: 1,
      });
      expect(harness.telegramProcessor.process).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
