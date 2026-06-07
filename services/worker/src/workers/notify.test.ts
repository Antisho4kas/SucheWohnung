import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("../redis.js", () => ({ createRedisConnection: vi.fn(() => ({})) }));
vi.mock("grammy", () => ({ Bot: vi.fn(() => ({ api: {} })) }));
vi.mock("bullmq", () => ({
  DelayedError: class DelayedError extends Error {
    constructor() {
      super("Delayed");
      this.name = "DelayedError";
    }
  },
  Worker: vi.fn(() => ({ on: vi.fn() })),
}));

import { runNotifyJob } from "./notify.js";
import { createTelegramDedupeKey } from "./telegram-delivery.js";

const now = new Date("2026-06-02T12:00:00.000Z");
const changeVersion = new Date("2026-06-02T11:59:00.000Z");

function createTelegramError(
  errorCode: number,
  description: string,
  parameters?: Record<string, unknown>,
) {
  return {
    error_code: errorCode,
    description,
    parameters,
    response: {
      error_code: errorCode,
      description,
      parameters,
    },
  };
}

function createMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    state: "pending",
    matchedAt: now,
    profile: {
      id: "profile-1",
      userId: "user-1",
      notify: true,
      user: {
        telegramSubscriptions: [
          {
            id: "sub-1",
            chatId: 12345n,
            enabled: true,
          },
        ],
      },
    },
    listing: {
      id: "listing-1",
      firstSeenAt: new Date("2026-06-01T10:00:00.000Z"),
      url: 'https://example.com/listing?city=Berlin&name="x"',
      city: "Berlin <Mitte>",
      price: 1000,
      area: 55,
      rooms: 2,
      source: { name: "Immowelt & Co" },
      images: [],
    },
    ...overrides,
  };
}

function createPrisma(match = createMatch()) {
  return {
    match: {
      findUnique: vi.fn().mockResolvedValue(match),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: "notification-1",
        ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    telegramSubscription: {
      update: vi.fn().mockResolvedValue({}),
    },
    listingHistory: {
      findFirst: vi.fn().mockResolvedValue({ changedAt: changeVersion }),
    },
  };
}

function createJob(overrides: Record<string, unknown> = {}) {
  return {
    data: { matchId: "match-1", event: "created" },
    attemptsMade: 0,
    opts: { attempts: 5 },
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const telegramApi = {
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    sendPhoto: vi.fn().mockResolvedValue({ ok: true }),
  };
  const deps = {
    prisma: createPrisma(),
    telegramApi,
    rateLimiter: {
      consume: vi.fn().mockResolvedValue({ allowed: true }),
    },
    now: () => now,
    ...overrides,
  };
  return deps as any;
}

describe("notify worker Telegram delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an escaped Telegram notification once and marks the match notified", async () => {
    const match = createMatch({
      listing: {
        ...createMatch().listing,
        images: [{ url: "https://img.example/listing-1.jpg" }],
      },
    });
    const prisma = createPrisma(match);
    const deps = createDeps({ prisma });
    const job = createJob();

    await runNotifyJob(job as any, "lock-token", deps);

    const dedupeKey = createTelegramDedupeKey({
      subscriptionId: "sub-1:profile-1",
      listingId: "listing-1",
      changeVersion: "2026-06-01T10:00:00.000Z",
    });
    expect(prisma.listingHistory.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchId: "match-1",
        subscriptionId: "sub-1",
        channel: "telegram",
        status: "pending",
        dedupeKey,
      }),
    });
    expect(deps.telegramApi.sendPhoto).toHaveBeenCalledWith(
      "12345",
      "https://img.example/listing-1.jpg",
      expect.objectContaining({ parse_mode: "HTML" }),
    );
    const caption = deps.telegramApi.sendPhoto.mock.calls[0]?.[2].caption;
    expect(caption).toContain("Berlin &lt;Mitte&gt;");
    expect(caption).toContain("Immowelt &amp; Co");
    expect(caption).toContain(
      'href="https://example.com/listing?city=Berlin&amp;name=%22x%22"',
    );
    expect(caption).not.toContain("Berlin <Mitte>");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey, status: "queued" },
      data: expect.objectContaining({
        status: "sent",
        sentAt: now,
        error: null,
      }),
    });
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("marks permanent Telegram failures as failed without retrying", async () => {
    const prisma = createPrisma();
    const deps = createDeps({ prisma });
    deps.telegramApi.sendMessage.mockRejectedValue(
      createTelegramError(400, "Bad Request: chat not found"),
    );

    await runNotifyJob(createJob() as any, "lock-token", deps);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String), status: "queued" },
      data: expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("telegram_permanent"),
      }),
    });
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("throws retryable Telegram errors for BullMQ retry and keeps match pending", async () => {
    const prisma = createPrisma();
    const deps = createDeps({ prisma });
    deps.telegramApi.sendMessage.mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(
      runNotifyJob(createJob() as any, "lock-token", deps),
    ).rejects.toThrow("telegram_retryable");

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String), status: "queued" },
      data: expect.objectContaining({
        status: "pending",
        error: expect.stringContaining("ETIMEDOUT"),
      }),
    });
    expect(prisma.match.updateMany).not.toHaveBeenCalled();
  });

  it("disables blocked subscriptions and records a terminal failed notification", async () => {
    const prisma = createPrisma();
    const deps = createDeps({ prisma });
    deps.telegramApi.sendMessage.mockRejectedValue(
      createTelegramError(403, "Forbidden: bot was blocked by the user"),
    );

    await runNotifyJob(createJob() as any, "lock-token", deps);

    expect(prisma.telegramSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { enabled: false },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String), status: "queued" },
      data: expect.objectContaining({
        status: "failed",
        error: "telegram_bot_blocked",
      }),
    });
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("delays the job before calling Telegram when local rate limits are exhausted", async () => {
    const prisma = createPrisma();
    const deps = createDeps({
      prisma,
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({
          allowed: false,
          retryAfterMs: 1000,
          scope: "chat",
        }),
      },
    });
    const job = createJob();

    await expect(
      runNotifyJob(job as any, "lock-token", deps),
    ).rejects.toMatchObject({ name: "DelayedError" });

    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(
      now.getTime() + 1000,
      "lock-token",
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String), status: "queued" },
      data: expect.objectContaining({
        status: "pending",
        error: "telegram_rate_limited:chat",
      }),
    });
    expect(prisma.match.updateMany).not.toHaveBeenCalled();
  });

  it("delays the job using Telegram retry_after on 429 responses", async () => {
    const prisma = createPrisma();
    const deps = createDeps({ prisma });
    deps.telegramApi.sendMessage.mockRejectedValue(
      createTelegramError(429, "Too Many Requests: retry after 3", {
        retry_after: 3,
      }),
    );
    const job = createJob();

    await expect(
      runNotifyJob(job as any, "lock-token", deps),
    ).rejects.toMatchObject({ name: "DelayedError" });

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      now.getTime() + 3000,
      "lock-token",
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String), status: "queued" },
      data: expect.objectContaining({
        status: "pending",
        error: "telegram_retry_after:3",
      }),
    });
    expect(prisma.match.updateMany).not.toHaveBeenCalled();
  });

  it("does not send Telegram again when the stable dedupe key is already sent", async () => {
    const prisma = createPrisma();
    prisma.notification.findUnique.mockResolvedValue({
      id: "notification-1",
      status: "sent",
    });
    const deps = createDeps({ prisma });

    await runNotifyJob(createJob() as any, "lock-token", deps);

    const dedupeKey = createTelegramDedupeKey({
      subscriptionId: "sub-1:profile-1",
      listingId: "listing-1",
      changeVersion: "2026-06-01T10:00:00.000Z",
    });
    expect(prisma.notification.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("does not send Telegram when the dedupe key is already in flight", async () => {
    const prisma = createPrisma();
    prisma.notification.findUnique.mockResolvedValue({
      id: "notification-1",
      status: "queued",
    });
    const deps = createDeps({ prisma });

    await expect(
      runNotifyJob(createJob() as any, "lock-token", deps),
    ).rejects.toThrow("telegram_delivery_in_flight");

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
    expect(prisma.match.updateMany).not.toHaveBeenCalled();
  });

  it("skips delivery when the listing already reached the user via another rule", async () => {
    const match = createMatch({
      id: "match-2",
      profile: {
        id: "profile-2",
        userId: "user-1",
        notify: true,
        user: {
          telegramSubscriptions: [{ id: "sub-1", chatId: 12345n, enabled: true }],
        },
      },
    });
    const prisma = createPrisma(match);
    // A 'sent' notification already exists for this subscription + listing via
    // a different profile/rule.
    prisma.notification.findFirst.mockResolvedValue({
      id: "notification-prior",
      status: "sent",
    });
    const deps = createDeps({ prisma });

    await runNotifyJob(createJob({ data: { matchId: "match-2", event: "created" } }) as any, "lock-token", deps);

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        subscriptionId: "sub-1",
        status: "sent",
        match: { listingId: "listing-1", profileId: { not: "profile-2" } },
      },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
    // The duplicate match is still marked notified so it is not retried.
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-2", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("sends a changed notification for an already notified match", async () => {
    const match = createMatch({ state: "notified" });
    const prisma = createPrisma(match);
    prisma.listingHistory.findFirst.mockResolvedValue({
      changedAt: new Date("2026-06-03T10:00:00.000Z"),
    });
    const deps = createDeps({ prisma });

    await runNotifyJob(
      createJob({
        data: {
          matchId: "match-1",
          event: "changed",
          changeVersion: "2026-06-02T11:59:00.000Z",
        },
      }) as any,
      "lock-token",
      deps,
    );

    const dedupeKey = createTelegramDedupeKey({
      subscriptionId: "sub-1:profile-1",
      listingId: "listing-1",
      changeVersion: "2026-06-02T11:59:00.000Z",
    });
    expect(prisma.listingHistory.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dedupeKey }),
    });
    expect(deps.telegramApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("does not resend the same changed notification version", async () => {
    const match = createMatch({ state: "notified" });
    const prisma = createPrisma(match);
    prisma.notification.findUnique.mockResolvedValue({
      id: "notification-1",
      status: "sent",
    });
    const deps = createDeps({ prisma });

    await runNotifyJob(
      createJob({
        data: {
          matchId: "match-1",
          event: "changed",
          changeVersion: "2026-06-02T11:59:00.000Z",
        },
      }) as any,
      "lock-token",
      deps,
    );

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
  });

  it("fails changed notifications closed when changeVersion is missing", async () => {
    const deps = createDeps();

    await expect(
      runNotifyJob(
        createJob({ data: { matchId: "match-1", event: "changed" } }) as any,
        "lock-token",
        deps,
      ),
    ).rejects.toThrow("changeVersion");

    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
  });

  it("treats missing bot configuration as retryable until the final attempt", async () => {
    const prisma = createPrisma();
    const deps = createDeps({ prisma, telegramApi: null });

    await expect(
      runNotifyJob(createJob() as any, "lock-token", deps),
    ).rejects.toThrow("bot_not_configured");

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String) },
      data: expect.objectContaining({
        status: "pending",
        error: "bot_not_configured",
      }),
    });
    expect(prisma.match.updateMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    prisma.match.findUnique.mockResolvedValue(createMatch());
    prisma.notification.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockImplementation(async ({ data }) => ({
      id: "notification-2",
      ...data,
    }));

    await runNotifyJob(
      createJob({ attemptsMade: 4, opts: { attempts: 5 } }) as any,
      "lock-token",
      deps,
    );

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String) },
      data: expect.objectContaining({
        status: "failed",
        error: "bot_not_configured",
      }),
    });
    expect(prisma.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", state: "pending" },
      data: { state: "notified" },
    });
  });

  it("does not let a duplicate rate-limited job reset an in-flight notification", async () => {
    const prisma = createPrisma();
    prisma.notification.findUnique
      .mockResolvedValueOnce({ id: "notification-1", status: "pending" })
      .mockResolvedValueOnce({ id: "notification-1", status: "sent" });
    prisma.notification.updateMany.mockImplementation(
      async ({ where, data }) => {
        if (where.status === "pending") return { count: 0 };
        if (where.status === "queued") return { count: 0 };
        return { count: 1, data };
      },
    );
    const deps = createDeps({
      prisma,
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({
          allowed: false,
          retryAfterMs: 1000,
          scope: "chat",
        }),
      },
    });

    await runNotifyJob(createJob() as any, "lock-token", deps);

    expect(deps.rateLimiter.consume).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String) },
      data: expect.objectContaining({
        status: "pending",
        error: "telegram_rate_limited:chat",
      }),
    });
  });

  it("falls back to text delivery when photo delivery has a permanent error", async () => {
    const match = createMatch({
      listing: {
        ...createMatch().listing,
        images: [{ url: "https://img.example/broken.jpg" }],
      },
    });
    const prisma = createPrisma(match);
    const deps = createDeps({ prisma });
    deps.telegramApi.sendPhoto.mockRejectedValue(
      createTelegramError(400, "Bad Request: failed to get HTTP URL content"),
    );

    await runNotifyJob(createJob() as any, "lock-token", deps);

    expect(deps.telegramApi.sendPhoto).toHaveBeenCalledTimes(1);
    expect(deps.telegramApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: expect.any(String), status: "queued" },
      data: expect.objectContaining({ status: "sent" }),
    });
  });

  it("does not render unsafe listing or image URL schemes", async () => {
    const match = createMatch({
      listing: {
        ...createMatch().listing,
        url: "javascript:alert(1)",
        images: [{ url: "javascript:alert(2)" }],
      },
    });
    const prisma = createPrisma(match);
    const deps = createDeps({ prisma });

    await runNotifyJob(createJob() as any, "lock-token", deps);

    expect(deps.telegramApi.sendPhoto).not.toHaveBeenCalled();
    expect(deps.telegramApi.sendMessage).toHaveBeenCalledTimes(1);
    const text = deps.telegramApi.sendMessage.mock.calls[0]?.[1];
    expect(text).toContain("Ссылка на объявление недоступна");
    expect(text).not.toContain("javascript:");
  });
});
