import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  listing: {
    findUnique: vi.fn(),
  },
  filterDefinition: {
    findMany: vi.fn(),
  },
  searchProfile: {
    findMany: vi.fn(),
  },
  match: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

const notifyQueueAddMock = vi.hoisted(() => vi.fn());
const autoReplyQueueAddMock = vi.hoisted(() => vi.fn());

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../redis.js", () => ({ createRedisConnection: vi.fn(() => ({})) }));
vi.mock("bullmq", () => ({
  Queue: vi.fn(function (name: string) {
    return {
      add: name === "auto-reply" ? autoReplyQueueAddMock : notifyQueueAddMock,
    };
  }),
  Worker: vi.fn(function () {
    return { on: vi.fn() };
  }),
}));

import { runMatchJob } from "./match.js";

const baseListing = {
  id: "listing-1",
  source: { slug: "mock" },
  externalId: "external-1",
  url: "https://example.com/listing-1",
  title: "Berlin flat",
  price: 1000,
  warmRent: 1100,
  area: 55,
  rooms: 2,
  city: "Berlin",
  bundesland: "Berlin",
  postalCode: "10115",
  attributes: { balcony: true, garden: true },
  status: "active",
  raw: undefined,
};

const filterDefinitions = [
  {
    key: "city",
    label: { en: "City" },
    dataType: "text",
    operatorSet: ["eq", "in"],
    config: { binding: { column: "city" } },
    isActive: true,
  },
  {
    key: "price",
    label: { en: "Price" },
    dataType: "number",
    operatorSet: ["gte", "lte"],
    config: { binding: { column: "price" } },
    isActive: true,
  },
  {
    key: "location",
    label: { en: "Radius" },
    dataType: "geo",
    operatorSet: ["within"],
    config: { binding: { column: "geo" } },
    isActive: true,
  },
  {
    key: "garden",
    label: { en: "Garden" },
    dataType: "bool",
    operatorSet: ["eq"],
    config: { binding: { attribute: "garden" } },
    isActive: true,
  },
];

function profile(
  id: string,
  filters: Array<{ key: string; operator: string; value: unknown }>,
  notify = true,
  autoReply?: { enabled?: boolean; text?: string | null },
) {
  return {
    id,
    notify,
    autoReplyEnabled: autoReply?.enabled ?? false,
    autoReplyText: autoReply?.text ?? null,
    filters: filters.map((filter) => ({
      operator: filter.operator,
      value: filter.value,
      definition: { key: filter.key },
    })),
  };
}

async function runJob() {
  await runMatchJob({ data: { listingId: baseListing.id, event: "created" } });
}

async function runChangedJob() {
  await runMatchJob({
    data: {
      listingId: baseListing.id,
      event: "changed",
      changeVersion: "2026-06-02T11:59:00.000Z",
    },
  });
}

describe("match worker correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.listing.findUnique.mockResolvedValue(baseListing);
    prismaMock.filterDefinition.findMany.mockResolvedValue(filterDefinitions);
    prismaMock.searchProfile.findMany.mockResolvedValue([]);
    prismaMock.match.create.mockImplementation(async ({ data }) => ({
      id: `match-${data.profileId}`,
      ...data,
    }));
    prismaMock.match.findUnique.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it("creates matches for every matching profile for one listing", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-city", [
        { key: "city", operator: "eq", value: "Berlin" },
      ]),
      profile("profile-price", [
        { key: "price", operator: "lte", value: 1200 },
      ]),
    ]);

    await runJob();

    expect(prismaMock.match.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.match.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ profileId: "profile-city" }),
      }),
    );
    expect(prismaMock.match.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ profileId: "profile-price" }),
      }),
    );
    expect(notifyQueueAddMock).toHaveBeenCalledTimes(2);
  });

  it("does not enqueue a duplicate created notification for an existing match", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-duplicate", [
        { key: "city", operator: "eq", value: "Berlin" },
      ]),
    ]);
    prismaMock.match.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: "match-profile-duplicate",
      state: "notified",
    });

    await runJob();

    expect(prismaMock.match.findUnique).toHaveBeenCalledWith({
      where: {
        uq_profile_listing: {
          profileId: "profile-duplicate",
          listingId: "listing-1",
        },
      },
    });
    expect(notifyQueueAddMock).not.toHaveBeenCalled();
  });

  it("re-enqueues a duplicate created notification only for an existing pending match", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-duplicate", [
        { key: "city", operator: "eq", value: "Berlin" },
      ]),
    ]);
    prismaMock.match.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: "match-profile-duplicate",
      state: "pending",
    });

    await runJob();

    expect(notifyQueueAddMock).toHaveBeenCalledWith(
      "notify",
      { matchId: "match-profile-duplicate", event: "created" },
      expect.objectContaining({ jobId: "notify-match-profile-duplicate" }),
    );
  });

  it("continues matching after duplicate created match handling", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-duplicate", [
        { key: "city", operator: "eq", value: "Berlin" },
      ]),
      profile("profile-new", [{ key: "price", operator: "lte", value: 1200 }]),
    ]);
    prismaMock.match.create
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "match-profile-new" });
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: "match-profile-duplicate",
      state: "notified",
    });

    await runJob();

    expect(prismaMock.match.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.match.findUnique).toHaveBeenCalledWith({
      where: {
        uq_profile_listing: {
          profileId: "profile-duplicate",
          listingId: "listing-1",
        },
      },
    });
    expect(notifyQueueAddMock).toHaveBeenCalledTimes(1);
    expect(notifyQueueAddMock).toHaveBeenCalledWith(
      "notify",
      { matchId: "match-profile-new", event: "created" },
      expect.objectContaining({ jobId: "notify-match-profile-new" }),
    );
  });

  it("enqueues a versioned changed notification for an existing unique match", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-duplicate", [
        { key: "city", operator: "eq", value: "Berlin" },
      ]),
    ]);
    prismaMock.match.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: "match-profile-duplicate",
      state: "notified",
    });

    await runChangedJob();

    expect(notifyQueueAddMock).toHaveBeenCalledWith(
      "notify",
      {
        matchId: "match-profile-duplicate",
        event: "changed",
        changeVersion: "2026-06-02T11:59:00.000Z",
      },
      expect.objectContaining({
        jobId: "notify-match-profile-duplicate-2026-06-02T11-59-00-000Z",
      }),
    );
  });

  it("enqueues a versioned changed notification for a newly matching profile", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-new", [{ key: "price", operator: "lte", value: 1200 }]),
    ]);

    await runChangedJob();

    expect(prismaMock.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: "profile-new",
          listingId: "listing-1",
          state: "pending",
        }),
      }),
    );
    expect(notifyQueueAddMock).toHaveBeenCalledWith(
      "notify",
      {
        matchId: "match-profile-new",
        event: "changed",
        changeVersion: "2026-06-02T11:59:00.000Z",
      },
      expect.objectContaining({
        jobId: "notify-match-profile-new-2026-06-02T11-59-00-000Z",
      }),
    );
  });

  it("fails changed events closed when changeVersion is missing", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-city", [
        { key: "city", operator: "eq", value: "Berlin" },
      ]),
    ]);

    await expect(
      runMatchJob({ data: { listingId: baseListing.id, event: "changed" } }),
    ).rejects.toThrow("changeVersion");

    expect(prismaMock.match.create).not.toHaveBeenCalled();
    expect(notifyQueueAddMock).not.toHaveBeenCalled();
  });

  it("creates a match for notify=false profiles without enqueueing notification", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-muted",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        false,
      ),
    ]);

    await runJob();

    expect(
      prismaMock.searchProfile.findMany.mock.calls[0]?.[0].where,
    ).toStrictEqual({ isActive: true });
    expect(prismaMock.match.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileId: "profile-muted" }),
      }),
    );
    expect(notifyQueueAddMock).not.toHaveBeenCalled();
  });

  it("loads custom filter definitions from the database", async () => {
    prismaMock.filterDefinition.findMany.mockResolvedValue([
      {
        key: "garden",
        label: { en: "Garden" },
        dataType: "bool",
        operatorSet: ["eq"],
        config: { binding: { attribute: "garden" } },
        isActive: true,
      },
    ]);
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-garden", [
        { key: "garden", operator: "eq", value: true },
      ]),
    ]);

    await runJob();

    expect(prismaMock.filterDefinition.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileId: "profile-garden" }),
      }),
    );
  });

  it("matches radius filters using persisted listing coordinates", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ lat: 52.52, lng: 13.405 }]);
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-radius", [
        {
          key: "location",
          operator: "within",
          value: { lat: 52.5, lng: 13.4, radius_km: 5 },
        },
      ]),
    ]);

    await runJob();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileId: "profile-radius" }),
      }),
    );
  });

  it("does not match radius filters outside persisted listing coordinates", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ lat: 52.52, lng: 13.405 }]);
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-radius", [
        {
          key: "location",
          operator: "within",
          value: { lat: 48.137, lng: 11.575, radius_km: 5 },
        },
      ]),
    ]);

    await runJob();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.match.create).not.toHaveBeenCalled();
    expect(notifyQueueAddMock).not.toHaveBeenCalled();
  });

  it("does not match radius filters without persisted listing coordinates", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-radius", [
        {
          key: "location",
          operator: "within",
          value: { lat: 52.5, lng: 13.4, radius_km: 5 },
        },
      ]),
    ]);

    await runJob();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.match.create).not.toHaveBeenCalled();
    expect(notifyQueueAddMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("has no persisted geo"),
    );
    warn.mockRestore();
  });

  it("enqueues an auto-reply job for a matched profile with auto-reply enabled", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-auto",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        true,
        { enabled: true, text: "Hallo, ist die Wohnung noch verfügbar?" },
      ),
    ]);

    await runJob();

    expect(notifyQueueAddMock).toHaveBeenCalledTimes(1);
    expect(autoReplyQueueAddMock).toHaveBeenCalledTimes(1);
    expect(autoReplyQueueAddMock).toHaveBeenCalledWith(
      "auto-reply",
      { matchId: "match-profile-auto", event: "created" },
      expect.objectContaining({ jobId: "auto-reply-match-profile-auto" }),
    );
  });

  it("enqueues an auto-reply job even when notify is disabled", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-auto-muted",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        false,
        { enabled: true, text: "Interessiert!" },
      ),
    ]);

    await runJob();

    expect(notifyQueueAddMock).not.toHaveBeenCalled();
    expect(autoReplyQueueAddMock).toHaveBeenCalledTimes(1);
    expect(autoReplyQueueAddMock).toHaveBeenCalledWith(
      "auto-reply",
      { matchId: "match-profile-auto-muted", event: "created" },
      expect.objectContaining({ jobId: "auto-reply-match-profile-auto-muted" }),
    );
  });

  it("enqueues a versioned auto-reply job for changed events", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile("profile-auto", [{ key: "price", operator: "lte", value: 1200 }], true, {
        enabled: true,
        text: "Hallo!",
      }),
    ]);

    await runChangedJob();

    expect(autoReplyQueueAddMock).toHaveBeenCalledWith(
      "auto-reply",
      {
        matchId: "match-profile-auto",
        event: "changed",
        changeVersion: "2026-06-02T11:59:00.000Z",
      },
      expect.objectContaining({
        jobId: "auto-reply-match-profile-auto-2026-06-02T11-59-00-000Z",
      }),
    );
  });

  it("does not enqueue an auto-reply job when auto-reply is disabled", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-auto-off",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        true,
        { enabled: false, text: "Won't send" },
      ),
    ]);

    await runJob();

    expect(prismaMock.match.create).toHaveBeenCalledTimes(1);
    expect(autoReplyQueueAddMock).not.toHaveBeenCalled();
  });

  it("does not enqueue an auto-reply job when auto-reply text is empty", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-auto-empty",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        true,
        { enabled: true, text: "   " },
      ),
    ]);

    await runJob();

    expect(prismaMock.match.create).toHaveBeenCalledTimes(1);
    expect(autoReplyQueueAddMock).not.toHaveBeenCalled();
  });

  it("enqueues an auto-reply job on the duplicate path for a pending match", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-auto-dup",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        true,
        { enabled: true, text: "Immer noch interessiert" },
      ),
    ]);
    prismaMock.match.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: "match-profile-auto-dup",
      state: "pending",
    });

    await runJob();

    expect(autoReplyQueueAddMock).toHaveBeenCalledWith(
      "auto-reply",
      { matchId: "match-profile-auto-dup", event: "created" },
      expect.objectContaining({ jobId: "auto-reply-match-profile-auto-dup" }),
    );
  });

  it("does not re-enqueue an auto-reply job on the duplicate path for an already-notified match", async () => {
    prismaMock.searchProfile.findMany.mockResolvedValue([
      profile(
        "profile-auto-dup",
        [{ key: "city", operator: "eq", value: "Berlin" }],
        true,
        { enabled: true, text: "Immer noch interessiert" },
      ),
    ]);
    prismaMock.match.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.match.findUnique.mockResolvedValueOnce({
      id: "match-profile-auto-dup",
      state: "notified",
    });

    await runJob();

    expect(autoReplyQueueAddMock).not.toHaveBeenCalled();
  });
});
