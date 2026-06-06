import "reflect-metadata";

import { type INestApplication, HttpStatus } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_FILTER_DEFINITIONS } from "../../../../packages/shared/src/filters/registry.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { AllExceptionsFilter } from "../common/errors.filter.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CreateProfileDto, UpdateProfileDto } from "./dto.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesService } from "./profiles.service.js";

vi.mock("@suchewohnung/shared", async () => {
  const criteria =
    await import("../../../../packages/shared/src/matching/criteria.js");
  const types =
    await import("../../../../packages/shared/src/filters/types.js");
  const validation =
    await import("../../../../packages/shared/src/filters/validation.js");
  return { ...criteria, ...types, ...validation };
});

const dbFilterDefinitions = SEED_FILTER_DEFINITIONS.map(
  (definition, index) => ({
    id: `filter-${index}`,
    key: definition.key,
    label: definition.label,
    dataType: definition.dataType,
    operatorSet: [...definition.operatorSet],
    config: definition.config ?? {},
    isActive: definition.isActive ?? true,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
  }),
);

function createPrismaMock() {
  return {
    filterDefinition: {
      findMany: vi.fn().mockResolvedValue(dbFilterDefinitions),
    },
    user: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: "user-1", role: "user" }),
    },
    searchProfile: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "profile-1",
          ...data,
          filters: [],
        }),
      ),
      findUnique: vi.fn().mockResolvedValue({
        id: "profile-1",
        userId: "user-1",
        notify: true,
      }),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "profile-1",
          userId: "user-1",
          ...data,
          filters: [],
        }),
      ),
      delete: vi.fn(),
    },
    profileFilter: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    match: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

async function createApp() {
  const prisma = createPrismaMock();
  Reflect.defineMetadata(
    "design:paramtypes",
    [ProfilesService],
    ProfilesController,
  );
  Reflect.defineMetadata("design:paramtypes", [PrismaService], ProfilesService);
  Reflect.defineMetadata(
    "design:paramtypes",
    [Object, CreateProfileDto],
    ProfilesController.prototype,
    "create",
  );
  Reflect.defineMetadata(
    "design:paramtypes",
    [Object, String, UpdateProfileDto],
    ProfilesController.prototype,
    "update",
  );

  const authGuard = {
    canActivate: vi.fn((context) => {
      context.switchToHttp().getRequest().user = {
        sub: "user-1",
        email: "user@example.com",
        role: "user",
      };
      return true;
    }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [ProfilesController],
    providers: [
      ProfilesService,
      { provide: PrismaService, useValue: prisma },
      { provide: JwtAuthGuard, useValue: authGuard },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(authGuard)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma };
}

async function expectInvalidCreate(
  app: INestApplication,
  prisma: ReturnType<typeof createPrismaMock>,
  filters: Array<{ key: string; operator: string; value: unknown }>,
  expectedDetail: { field: string; issue: string | RegExp },
) {
  const response = await request(app.getHttpServer())
    .post("/api/v1/profiles")
    .set("x-request-id", "req-profile-invalid")
    .send({ name: "Invalid filters", filters })
    .expect(HttpStatus.BAD_REQUEST);

  expect(response.body).toMatchObject({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid profile filters",
      request_id: "req-profile-invalid",
    },
  });
  expect(response.body.error.details).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: expectedDetail.field,
        issue:
          expectedDetail.issue instanceof RegExp
            ? expect.stringMatching(expectedDetail.issue)
            : expectedDetail.issue,
      }),
    ]),
  );
  expect(prisma.searchProfile.create).not.toHaveBeenCalled();
}

describe("profiles API filter validation", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    const created = await createApp();
    app = created.app;
    prisma = created.prisma;
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a 400 error envelope for invalid numeric filter values", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/profiles")
      .set("x-request-id", "req-profile-1")
      .send({
        name: "Bad price",
        filters: [{ key: "price", operator: "lte", value: "abc" }],
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile filters",
        request_id: "req-profile-1",
      },
    });
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value",
          issue: "must be a finite number",
        }),
      ]),
    );
    expect(prisma.searchProfile.create).not.toHaveBeenCalled();
  });

  it("returns a 400 error envelope for malformed location filters", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/profiles")
      .set("x-request-id", "req-profile-2")
      .send({
        name: "Bad location",
        filters: [
          {
            key: "location",
            operator: "within",
            value: { lat: 52.52, lng: "13.405", radius_km: 5 },
          },
        ],
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile filters",
        request_id: "req-profile-2",
      },
    });
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value.lng",
          issue: "must be a finite number",
        }),
      ]),
    );
    expect(prisma.searchProfile.create).not.toHaveBeenCalled();
  });

  it("accepts the existing frontend filter payload and stores matcher-compatible criteria", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/profiles")
      .send({
        name: "Berlin valid",
        notify: true,
        filters: [
          { key: "city", operator: "eq", value: "Berlin" },
          { key: "postal_code", operator: "in", value: ["10115", "10117"] },
          { key: "bundesland", operator: "eq", value: "Berlin" },
          { key: "price", operator: "gte", value: 800 },
          { key: "price", operator: "lte", value: 1300 },
          { key: "area", operator: "gte", value: 45 },
          { key: "rooms", operator: "gte", value: 2.5 },
          { key: "provisionfrei", operator: "eq", value: true },
          {
            key: "location",
            operator: "within",
            value: { lat: 52.52, lng: 13.405, radius_km: 5 },
          },
        ],
      })
      .expect(HttpStatus.CREATED);

    expect(prisma.searchProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          criteria: {
            city: "Berlin",
            postal_code: ["10115", "10117"],
            bundesland: "Berlin",
            price: { gte: 800, lte: 1300 },
            area: { gte: 45 },
            rooms: { gte: 2.5 },
            attrs: { provisionfrei: true },
            location: { lat: 52.52, lng: 13.405, radius_km: 5 },
          },
        }),
      }),
    );
  });

  it.each([
    [
      "invalid boolean",
      [{ key: "provisionfrei", operator: "eq", value: "true" }],
      { field: "filters[0].value", issue: "must be a boolean" },
    ],
    [
      "invalid enum",
      [{ key: "bundesland", operator: "eq", value: "Atlantis" }],
      { field: "filters[0].value", issue: /must be one of/ },
    ],
    [
      "unknown key",
      [{ key: "provision_free", operator: "eq", value: true }],
      { field: "filters[0].key", issue: "unknown filter key" },
    ],
    [
      "disallowed operator",
      [{ key: "price", operator: "eq", value: 1000 }],
      {
        field: "filters[0].operator",
        issue: "operator is not allowed for this filter",
      },
    ],
    [
      "empty text",
      [{ key: "city", operator: "eq", value: "   " }],
      { field: "filters[0].value", issue: "must be a non-empty string" },
    ],
    [
      "min greater than max",
      [
        { key: "price", operator: "gte", value: 1500 },
        { key: "price", operator: "lte", value: 1200 },
      ],
      { field: "price", issue: "gte must be <= lte" },
    ],
  ])("returns a 400 error envelope for %s", async (_name, filters, detail) => {
    await expectInvalidCreate(app, prisma, filters, detail);
  });

  it("uses the same validation path for update filters", async () => {
    const response = await request(app.getHttpServer())
      .patch("/api/v1/profiles/profile-1")
      .set("x-request-id", "req-profile-update")
      .send({
        filters: [
          { key: "rooms", operator: "gte", value: 4 },
          { key: "rooms", operator: "lte", value: 2 },
        ],
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile filters",
        request_id: "req-profile-update",
      },
    });
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "rooms",
          issue: "gte must be <= lte",
        }),
      ]),
    );
    expect(prisma.profileFilter.deleteMany).not.toHaveBeenCalled();
    expect(prisma.profileFilter.createMany).not.toHaveBeenCalled();
    expect(prisma.searchProfile.update).not.toHaveBeenCalled();
  });
});
