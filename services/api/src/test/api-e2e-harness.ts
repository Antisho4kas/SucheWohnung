import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ZodValidationPipe } from "nestjs-zod";
import { vi } from "vitest";
import { AuthController } from "../auth/auth.controller.js";
import { LoginDto } from "../auth/dto.js";
import { AuthService } from "../auth/auth.service.js";
import { EmailService } from "../email/email.service.js";
import { AllExceptionsFilter } from "../common/errors.filter.js";
import { HealthController } from "../health/health.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueueService } from "../queue/queue.service.js";
import { TelegramLinkService } from "../auth/telegram-link.service.js";
import { TelegramWebhookController } from "../telegram/telegram-webhook.module.js";
import { TelegramUpdateProcessorService } from "../telegram/telegram-update-processor.service.js";

export type ApiE2eHarness = {
  app: INestApplication;
  prisma: ReturnType<typeof createPrismaMock>;
  queue: ReturnType<typeof createQueueMock>;
  auth: ReturnType<typeof createAuthMock>;
  telegramProcessor: { process: ReturnType<typeof import("vitest").vi.fn> };
};

export function createPrismaMock() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    emailToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    filterDefinition: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    searchProfile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    profileFilter: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    match: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    listing: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    listingHistory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    telegramSubscription: {
      findFirst: vi.fn(),
    },
  };
}

export function createQueueMock() {
  return {
    enqueueCollect: vi.fn().mockResolvedValue(undefined),
    enqueueMatch: vi.fn().mockResolvedValue(undefined),
    enqueueNotify: vi.fn().mockResolvedValue(undefined),
    enqueueTelegramUpdate: vi.fn().mockResolvedValue(undefined),
    getCounts: vi.fn().mockResolvedValue({}),
    retryFailed: vi.fn().mockResolvedValue(0),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

export function createAuthMock() {
  return {
    register: vi.fn(),
    generateVerificationToken: vi.fn(),
    verifyEmail: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    generatePasswordResetToken: vi.fn(),
    resetPassword: vi.fn(),
  };
}

export async function createApiE2eHarness(): Promise<ApiE2eHarness> {
  const prisma = createPrismaMock();
  const queue = createQueueMock();
  const auth = createAuthMock();
  const telegramProcessor = { process: vi.fn().mockResolvedValue(undefined) };
  Reflect.defineMetadata("design:paramtypes", [PrismaService], HealthController);
  Reflect.defineMetadata(
    "design:paramtypes",
    [AuthService, TelegramLinkService, EmailService],
    AuthController,
  );
  Reflect.defineMetadata(
    "design:paramtypes",
    [LoginDto],
    AuthController.prototype,
    "login",
  );
  Reflect.defineMetadata(
    "design:paramtypes",
    [QueueService, TelegramUpdateProcessorService],
    TelegramWebhookController,
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController, AuthController, TelegramWebhookController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: QueueService, useValue: queue },
      { provide: AuthService, useValue: auth },
      { provide: TelegramLinkService, useValue: { createLink: vi.fn() } },
      {
        provide: EmailService,
        useValue: {
          sendVerification: vi.fn(),
          sendPasswordReset: vi.fn(),
        },
      },
      { provide: TelegramUpdateProcessorService, useValue: telegramProcessor },
    ],
  })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma, queue, auth, telegramProcessor };
}
