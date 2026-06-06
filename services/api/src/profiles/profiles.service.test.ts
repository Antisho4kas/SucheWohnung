import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SEED_FILTER_DEFINITIONS } from "../../../../packages/shared/src/filters/registry.js";
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
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({
            id: "profile-1",
            userId: data.userId,
            ...data,
            filters: [],
          }),
        ),
      findUnique: vi.fn().mockResolvedValue({
        id: "profile-1",
        userId: "user-1",
        notify: true,
      }),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
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
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    match: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

async function expectInvalidCreate(
  filters: Array<{ key: string; operator: string; value: unknown }>,
  expectedDetail: { field: string; issue: string | RegExp },
) {
  const prisma = createPrismaMock();
  const service = new ProfilesService(prisma as never);
  const detail = {
    ...expectedDetail,
    issue:
      expectedDetail.issue instanceof RegExp
        ? expect.stringMatching(expectedDetail.issue)
        : expectedDetail.issue,
  };

  await expect(
    service.create("user-1", { name: "Invalid filters", filters }),
  ).rejects.toMatchObject({
    response: {
      message: "Invalid profile filters",
      details: expect.arrayContaining([expect.objectContaining(detail)]),
    },
  });
  expect(prisma.searchProfile.create).not.toHaveBeenCalled();
}

describe("ProfilesService filter validation", () => {
  it("creates profiles with validated filters and matcher-compatible criteria", async () => {
    const prisma = createPrismaMock();
    const service = new ProfilesService(prisma as never);

    await service.create("user-1", {
      name: "Berlin valid",
      notify: true,
      filters: [
        { key: "price", operator: "gte", value: 800 },
        { key: "price", operator: "lte", value: 1300 },
        { key: "area", operator: "gte", value: 45 },
        { key: "rooms", operator: "gte", value: 2.5 },
        { key: "provisionfrei", operator: "eq", value: false },
        {
          key: "location",
          operator: "within",
          value: { lat: 52.52, lng: 13.405, radius_km: 5 },
        },
      ],
    });

    expect(prisma.searchProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          criteria: {
            price: { gte: 800, lte: 1300 },
            area: { gte: 45 },
            rooms: { gte: 2.5 },
            attrs: { provisionfrei: false },
            location: { lat: 52.52, lng: 13.405, radius_km: 5 },
          },
        }),
      }),
    );
  });

  it("rejects invalid create filters before user limit checks or persistence", async () => {
    const prisma = createPrismaMock();
    const service = new ProfilesService(prisma as never);

    await expect(
      service.create("user-1", {
        name: "Bad price",
        filters: [{ key: "price", operator: "lte", value: "abc" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.searchProfile.create).not.toHaveBeenCalled();
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
      "min greater than max",
      [
        { key: "rooms", operator: "gte", value: 4 },
        { key: "rooms", operator: "lte", value: 2 },
      ],
      { field: "rooms", issue: "gte must be <= lte" },
    ],
  ])("rejects %s", async (_name, filters, detail) => {
    await expectInvalidCreate(filters, detail);
  });

  it("rejects invalid update filters before replacing stored profile filters", async () => {
    const prisma = createPrismaMock();
    const service = new ProfilesService(prisma as never);

    await expect(
      service.update("user-1", "profile-1", {
        filters: [
          {
            key: "location",
            operator: "within",
            value: { lat: 52.52, radius_km: 5 },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.profileFilter.deleteMany).not.toHaveBeenCalled();
    expect(prisma.profileFilter.createMany).not.toHaveBeenCalled();
    expect(prisma.searchProfile.update).not.toHaveBeenCalled();
  });
});
