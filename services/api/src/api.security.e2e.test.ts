import {
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin/admin.module.js";
import { AuthController } from "./auth/auth.controller.js";
import { JwtAuthGuard, Public, RolesGuard, SuperAdminMutationGuard } from "./auth/guards.js";
import { ListingsController } from "./listings/listings.module.js";
import { MetricsController } from "./metrics/metrics.module.js";
import { MeController } from "./users/users.module.js";
import { AllExceptionsFilter } from "./common/errors.filter.js";
import { PrismaService } from "./prisma/prisma.service.js";
import { QueueService } from "./queue/queue.service.js";
import { AuthService } from "./auth/auth.service.js";
import { TelegramLinkService } from "./auth/telegram-link.service.js";
import { EmailService } from "./email/email.service.js";

@Public()
@Controller("api/v1/security-test")
class SecurityTestController {
  @Get("internal-error")
  internalError() {
    throw new InternalServerErrorException("Prisma password=secret stack trace");
  }
}

function createPrismaMock() {
  return {
    source: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: "target-1",
        role: "user",
        status: "active",
        locale: "de",
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "target-1",
        role: "user",
        status: "suspended",
      }),
    },
    listing: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    listingHistory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    filterDefinition: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userConsent: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
    searchProfile: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
    },
    telegramSubscription: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    subscription: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    match: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    notification: {
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(),
  };
}

async function createApp() {
  const prisma = createPrismaMock();
  const auth = {
    login: vi.fn().mockResolvedValue({ access_token: "access", refresh_token: "refresh" }),
    register: vi.fn(),
    generateVerificationToken: vi.fn(),
    verifyEmail: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    generatePasswordResetToken: vi.fn(),
    resetPassword: vi.fn(),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
    controllers: [
      AuthController,
      AdminController,
      ListingsController,
      MetricsController,
      MeController,
      SecurityTestController,
    ],
    providers: [
      { provide: APP_PIPE, useClass: ZodValidationPipe },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: PrismaService, useValue: prisma },
      { provide: JwtAuthGuard, useValue: { canActivate: vi.fn().mockReturnValue(true) } },
      { provide: RolesGuard, useValue: { canActivate: vi.fn().mockReturnValue(true) } },
      { provide: QueueService, useValue: { getCounts: vi.fn(), retryFailed: vi.fn() } },
      { provide: AuthService, useValue: auth },
      { provide: TelegramLinkService, useValue: { createLink: vi.fn() } },
      { provide: EmailService, useValue: { sendVerification: vi.fn(), sendPasswordReset: vi.fn() } },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: vi.fn((context) => {
        context.switchToHttp().getRequest().user = {
          sub: "user-1",
          email: "user@example.com",
          role: "admin",
        };
        return true;
      }),
    })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: vi.fn().mockReturnValue(true) })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma, auth };
}

async function createGuardedAdminApp() {
  const prisma = createPrismaMock();
  const jwtGuard = {
    canActivate: vi.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const role = req.headers["x-test-role"];
      if (!role) throw new UnauthorizedException("Missing token");
      req.user = {
        sub: req.headers["x-test-sub"] ?? "actor-1",
        email: "actor@example.com",
        role,
      };
      return true;
    }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminController],
    providers: [
      { provide: APP_PIPE, useClass: ZodValidationPipe },
      { provide: PrismaService, useValue: prisma },
      { provide: QueueService, useValue: { getCounts: vi.fn(), retryFailed: vi.fn() } },
      { provide: JwtAuthGuard, useValue: jwtGuard },
      RolesGuard,
      SuperAdminMutationGuard,
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(jwtGuard)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma, jwtGuard };
}

describe("API security e2e", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auth: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    const created = await createApp();
    app = created.app;
    prisma = created.prisma;
    auth = created.auth;
  });

  afterEach(async () => {
    await app.close();
  });

  it("rate limits auth login and uses the API error envelope", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "user@example.com", password: "secret" })
        .expect(HttpStatus.OK);
    }

    const blocked = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "user@example.com", password: "secret" })
      .expect(HttpStatus.TOO_MANY_REQUESTS);

    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("does not expose internal 500 messages over HTTP", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/security-test/internal-error")
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);

    expect(res.body.error).toMatchObject({ code: "INTERNAL", message: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("password=secret");
    expect(JSON.stringify(res.body)).not.toContain("Prisma");
  });

  it("rejects invalid admin source payloads before Prisma", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/sources")
      .send({ slug: {}, name: "Bad" })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.source.create).not.toHaveBeenCalled();
  });

  it("rejects source configs containing raw secrets before Prisma", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/sources")
      .send({ slug: "mock", name: "Mock", config: { password: "plain-text" } })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.source.create).not.toHaveBeenCalled();
  });

  it("rejects invalid admin user role and status payloads before Prisma", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/admin/users/target-1")
      .send({ role: "support", status: "verified" })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("prevents regular admins from assigning super_admin", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/admin/users/target-1")
      .send({ role: "super_admin" })
      .expect(HttpStatus.FORBIDDEN);

    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("prevents admins from escalating their own role", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      role: "admin",
      status: "active",
    });

    const res = await request(app.getHttpServer())
      .patch("/api/v1/admin/users/user-1")
      .send({ role: "super_admin" })
      .expect(HttpStatus.FORBIDDEN);

    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects invalid listings query before Prisma", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/listings?price_max=abc")
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.listing.findMany).not.toHaveBeenCalled();
  });

  it("rejects privilege-like fields in me update payloads before Prisma", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/me")
      .send({ locale: "de", role: "admin" })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("surfaces pending login rejection without issuing tokens", async () => {
    auth.login.mockRejectedValueOnce(new UnauthorizedException("Email verification required"));

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "pending@example.com", password: "correct-password" })
      .expect(HttpStatus.UNAUTHORIZED);

    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(res.body).not.toHaveProperty("access_token");
    expect(res.body).not.toHaveProperty("refresh_token");
  });

  it("does not expose metrics publicly by default in production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMetricsFlag = process.env.METRICS_PUBLIC_ENABLED;
    process.env.NODE_ENV = "production";
    delete process.env.METRICS_PUBLIC_ENABLED;

    try {
      const res = await request(app.getHttpServer())
        .get("/metrics")
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.error.code).toBe("NOT_FOUND");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalMetricsFlag === undefined) delete process.env.METRICS_PUBLIC_ENABLED;
      else process.env.METRICS_PUBLIC_ENABLED = originalMetricsFlag;
    }
  });
});

describe("API admin route guard integration", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const created = await createGuardedAdminApp();
    app = created.app;
    prisma = created.prisma;
  });

  afterEach(async () => {
    await app.close();
    delete process.env.SUPER_ADMIN_MUTATIONS_ENABLED;
  });

  it("rejects unauthenticated admin requests before controller execution", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .expect(HttpStatus.UNAUTHORIZED);

    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("rejects non-admin users through the real RolesGuard", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("x-test-role", "user")
      .expect(HttpStatus.FORBIDDEN);

    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("allows admin users through the real RolesGuard", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("x-test-role", "admin")
      .expect(HttpStatus.OK);

    expect(res.body).toEqual({ data: [] });
    expect(prisma.user.findMany).toHaveBeenCalled();
  });

  it("runs the route-level SuperAdminMutationGuard before admin self-service code", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/admin/users/target-1")
      .set("x-test-role", "admin")
      .send({ role: "super_admin" })
      .expect(HttpStatus.FORBIDDEN);

    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("blocks super_admin route mutations by default in beta", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/admin/users/target-1")
      .set("x-test-role", "super_admin")
      .send({ role: "super_admin" })
      .expect(HttpStatus.FORBIDDEN);

    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
