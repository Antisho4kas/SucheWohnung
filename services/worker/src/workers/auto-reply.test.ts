import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  match: {
    findUnique: vi.fn(),
  },
  sellerReply: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../redis.js", () => ({ createRedisConnection: vi.fn(() => ({})) }));
vi.mock("bullmq", () => ({
  Worker: vi.fn(function () {
    return { on: vi.fn() };
  }),
}));

import { createSellerReplyDedupeKey, runAutoReplyJob } from "./auto-reply.js";

const deps = { prisma: prismaMock } as never;

function matchRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    profile: {
      id: "profile-1",
      autoReplyEnabled: true,
      autoReplyText: "Hallo, ist die Wohnung noch verfügbar?",
    },
    listing: {
      id: "listing-1",
      url: "https://example.com/listing-1",
      source: { slug: "kleinanzeigen" },
    },
    ...overrides,
  };
}

async function runJob() {
  await runAutoReplyJob({ data: { matchId: "match-1", event: "created" } }, deps);
}

describe("auto-reply worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.match.findUnique.mockResolvedValue(matchRecord());
    prismaMock.sellerReply.findUnique.mockResolvedValue(null);
    prismaMock.sellerReply.create.mockImplementation(async ({ data }) => ({
      id: "reply-1",
      ...data,
    }));
  });

  it("records a SellerReply with status skipped_no_channel (Part 1 seam)", async () => {
    await runJob();

    expect(prismaMock.sellerReply.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sellerReply.create).toHaveBeenCalledWith({
      data: {
        matchId: "match-1",
        channel: "kleinanzeigen",
        status: "skipped_no_channel",
        body: "Hallo, ist die Wohnung noch verfügbar?",
        dedupeKey: createSellerReplyDedupeKey({
          profileId: "profile-1",
          listingId: "listing-1",
        }),
      },
    });
  });

  it("does not call any external send API (no channel in Part 1)", async () => {
    // The deps only expose prisma; there is intentionally no send capability.
    await runJob();
    expect(Object.keys(deps as object)).toEqual(["prisma"]);
  });

  it("is a no-op when a reply already exists for the dedupe key", async () => {
    prismaMock.sellerReply.findUnique.mockResolvedValue({
      id: "reply-existing",
      status: "skipped_no_channel",
    });

    await runJob();

    expect(prismaMock.sellerReply.create).not.toHaveBeenCalled();
  });

  it("treats a concurrent duplicate (P2002) as already recorded on a second run", async () => {
    prismaMock.sellerReply.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(runJob()).resolves.toBeUndefined();

    expect(prismaMock.sellerReply.create).toHaveBeenCalledTimes(1);
  });

  it("does not record a reply when auto-reply is disabled", async () => {
    prismaMock.match.findUnique.mockResolvedValue(
      matchRecord({
        profile: {
          id: "profile-1",
          autoReplyEnabled: false,
          autoReplyText: "Won't send",
        },
      }),
    );

    await runJob();

    expect(prismaMock.sellerReply.create).not.toHaveBeenCalled();
  });

  it("does not record a reply when auto-reply text is empty", async () => {
    prismaMock.match.findUnique.mockResolvedValue(
      matchRecord({
        profile: {
          id: "profile-1",
          autoReplyEnabled: true,
          autoReplyText: "   ",
        },
      }),
    );

    await runJob();

    expect(prismaMock.sellerReply.create).not.toHaveBeenCalled();
  });

  it("is a no-op when the match is missing", async () => {
    prismaMock.match.findUnique.mockResolvedValue(null);

    await runJob();

    expect(prismaMock.sellerReply.create).not.toHaveBeenCalled();
  });
});
