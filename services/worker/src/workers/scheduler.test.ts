import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCollectJobId, getSourceSchedulerId } from "../queue-options.js";

vi.useFakeTimers();

const prismaModuleMock = {
  prisma: {
    source: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    jobQueueAudit: {
      create: vi.fn(),
    },
  },
};

vi.mock("../prisma.js", () => prismaModuleMock);
vi.mock("../redis.js", () => ({ createRedisConnection: vi.fn() }));
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "collect-mock" }),
    getJob: vi.fn().mockResolvedValue(null),
    getJobs: vi.fn().mockResolvedValue([]),
    getJobSchedulers: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
    upsertJobScheduler: vi.fn().mockResolvedValue({ id: "scheduler:mock" }),
  })),
  Worker: vi.fn(),
}));

type SchedulerModule = Record<string, any>;

const sourceId = "11111111-1111-1111-1111-111111111111";
const inactiveSourceId = "22222222-2222-2222-2222-222222222222";

let scheduler: SchedulerModule;

beforeAll(async () => {
  scheduler = await import("./scheduler.js");
});

beforeEach(() => {
  vi.clearAllMocks();
});

function activeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: sourceId,
    slug: "mock",
    isActive: true,
    scheduleCron: "*/15 * * * *",
    rateLimitRpm: 30,
    ...overrides,
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const schedulerQueue = {
    upsertJobScheduler: vi.fn().mockResolvedValue({ id: "source:mock" }),
    getJobSchedulers: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  };

  const collectQueue = {
    add: vi.fn().mockResolvedValue({ id: getCollectJobId(sourceId) }),
    getJob: vi.fn().mockResolvedValue(null),
  };

  const prisma = {
    source: {
      findMany: vi.fn().mockResolvedValue([activeSource()]),
      findUnique: vi.fn().mockResolvedValue(activeSource()),
    },
    jobQueueAudit: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const connection = {
    set: vi.fn().mockResolvedValue("OK"),
    eval: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
  };

  return {
    schedulerQueue,
    collectQueue,
    prisma,
    connection,
    now: () => new Date("2026-06-02T12:00:00.000Z"),
    ...overrides,
  };
}

describe("worker scheduler orchestration", () => {
  it("upserts one BullMQ cron scheduler per active source", async () => {
    const deps = createDeps();

    await scheduler.syncSourceSchedulers(deps);

    expect(deps.schedulerQueue.upsertJobScheduler).toHaveBeenCalledWith(
      getSourceSchedulerId(sourceId),
      { pattern: "*/15 * * * *" },
      expect.objectContaining({
        name: "schedule-source",
        data: { sourceId, sourceSlug: "mock" },
        opts: expect.objectContaining({
          attempts: 3,
          backoff: expect.objectContaining({
            type: "exponential",
            delay: 5000,
          }),
        }),
      }),
    );
  });

  it("upserts a BullMQ maintenance scheduler for source schedule resync", async () => {
    const deps = createDeps();

    await scheduler.upsertSourceSchedulerSync(deps);

    expect(deps.schedulerQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "sources-sync",
      { every: 60_000 },
      expect.objectContaining({
        name: "sync-sources",
        opts: expect.objectContaining({
          attempts: 3,
          backoff: expect.objectContaining({
            type: "exponential",
            delay: 5000,
          }),
        }),
      }),
    );
  });

  it("removes schedulers for inactive or deleted sources", async () => {
    const deps = createDeps({
      prisma: {
        source: {
          findMany: vi.fn().mockResolvedValue([
            activeSource(),
            activeSource({
              id: inactiveSourceId,
              slug: "inactive",
              isActive: false,
            }),
          ]),
          findUnique: vi.fn(),
        },
        jobQueueAudit: { create: vi.fn().mockResolvedValue({}) },
      },
      schedulerQueue: {
        upsertJobScheduler: vi.fn().mockResolvedValue({ id: "source:mock" }),
        getJobSchedulers: vi
          .fn()
          .mockResolvedValue([
            { key: getSourceSchedulerId(inactiveSourceId) },
            { key: "source-deleted" },
          ]),
        removeJobScheduler: vi.fn().mockResolvedValue(true),
      },
    });

    await scheduler.syncSourceSchedulers(deps);

    expect(deps.schedulerQueue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(deps.schedulerQueue.removeJobScheduler).toHaveBeenCalledWith(
      getSourceSchedulerId(inactiveSourceId),
    );
    expect(deps.schedulerQueue.removeJobScheduler).toHaveBeenCalledWith(
      "source-deleted",
    );
  });

  it("removes a stale scheduler when cron upsert fails", async () => {
    const deps = createDeps({
      schedulerQueue: {
        upsertJobScheduler: vi
          .fn()
          .mockRejectedValue(new Error("invalid cron")),
        getJobSchedulers: vi
          .fn()
          .mockResolvedValue([{ key: getSourceSchedulerId(sourceId) }]),
        removeJobScheduler: vi.fn().mockResolvedValue(true),
      },
    });

    await scheduler.syncSourceSchedulers(deps);

    expect(deps.schedulerQueue.removeJobScheduler).toHaveBeenCalledWith(
      getSourceSchedulerId(sourceId),
    );
    expect(deps.prisma.jobQueueAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: "scheduler",
        jobId: getSourceSchedulerId(sourceId),
        status: "schedule_failed",
      }),
    });
  });

  it("removes a stale scheduler even when schedule failure audit fails", async () => {
    const deps = createDeps({
      schedulerQueue: {
        upsertJobScheduler: vi
          .fn()
          .mockRejectedValue(new Error("invalid cron")),
        getJobSchedulers: vi.fn().mockResolvedValue([]),
        removeJobScheduler: vi.fn().mockResolvedValue(true),
      },
      prisma: {
        source: {
          findMany: vi.fn().mockResolvedValue([activeSource()]),
          findUnique: vi.fn(),
        },
        jobQueueAudit: {
          create: vi.fn().mockRejectedValue(new Error("audit down")),
        },
      },
    });

    await expect(scheduler.syncSourceSchedulers(deps)).resolves.toBeUndefined();

    expect(deps.schedulerQueue.removeJobScheduler).toHaveBeenCalledWith(
      getSourceSchedulerId(sourceId),
    );
  });

  it("enqueues collect with retry/backoff options and a BullMQ-safe job id", async () => {
    const deps = createDeps();

    const result = await scheduler.enqueueCollectForSource(deps, {
      sourceId,
      sourceSlug: "mock",
    });

    expect(result.status).toBe("queued");
    expect(result.jobId).toBe(getCollectJobId(sourceId));
    expect(result.jobId).not.toContain(":");
    expect(deps.collectQueue.add).toHaveBeenCalledWith(
      "collect",
      { sourceSlug: "mock", rateLimitRpm: 30 },
      expect.objectContaining({
        jobId: getCollectJobId(sourceId),
        attempts: 3,
        backoff: expect.objectContaining({ type: "exponential", delay: 5000 }),
      }),
    );
    expect(deps.prisma.jobQueueAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: "collect",
        jobId: getCollectJobId(sourceId),
        status: "queued",
      }),
    });
  });

  it("does not retry the scheduler tick when queued-job audit fails after enqueue", async () => {
    const deps = createDeps({
      prisma: {
        source: {
          findMany: vi.fn(),
          findUnique: vi.fn().mockResolvedValue(activeSource()),
        },
        jobQueueAudit: {
          create: vi.fn().mockRejectedValue(new Error("audit down")),
        },
      },
    });

    await expect(
      scheduler.enqueueCollectForSource(deps, { sourceId, sourceSlug: "mock" }),
    ).resolves.toMatchObject({
      status: "queued",
      jobId: getCollectJobId(sourceId),
    });
    expect(deps.collectQueue.add).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue collect when a source already has an active collect job", async () => {
    const deps = createDeps({
      collectQueue: {
        add: vi.fn(),
        getJob: vi.fn().mockResolvedValue({
          id: getCollectJobId(sourceId),
          getState: vi.fn().mockResolvedValue("active"),
        }),
      },
    });

    const result = await scheduler.enqueueCollectForSource(deps, {
      sourceId,
      sourceSlug: "mock",
    });

    expect(result.status).toBe("skipped_active");
    expect(deps.collectQueue.add).not.toHaveBeenCalled();
    expect(deps.prisma.jobQueueAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: "collect",
        jobId: getCollectJobId(sourceId),
        status: "skipped_active",
      }),
    });
  });

  it.each(["waiting", "delayed", "prioritized", "waiting-children"])(
    "does not enqueue collect when a source already has a %s collect job",
    async (state) => {
      const deps = createDeps({
        collectQueue: {
          add: vi.fn(),
          getJob: vi.fn().mockResolvedValue({
            id: getCollectJobId(sourceId),
            getState: vi.fn().mockResolvedValue(state),
          }),
        },
      });

      const result = await scheduler.enqueueCollectForSource(deps, {
        sourceId,
        sourceSlug: "mock",
      });

      expect(result.status).toBe("skipped_duplicate");
      expect(deps.collectQueue.add).not.toHaveBeenCalled();
      expect(deps.prisma.jobQueueAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          queue: "collect",
          jobId: getCollectJobId(sourceId),
          status: "skipped_duplicate",
          payload: expect.objectContaining({ existingState: state }),
        }),
      });
    },
  );

  it("does not retry or enqueue when duplicate-skip audit fails", async () => {
    const deps = createDeps({
      collectQueue: {
        add: vi.fn(),
        getJob: vi.fn().mockResolvedValue({
          id: getCollectJobId(sourceId),
          getState: vi.fn().mockResolvedValue("waiting"),
        }),
      },
      prisma: {
        source: {
          findMany: vi.fn(),
          findUnique: vi.fn().mockResolvedValue(activeSource()),
        },
        jobQueueAudit: {
          create: vi.fn().mockRejectedValue(new Error("audit down")),
        },
      },
    });

    await expect(
      scheduler.enqueueCollectForSource(deps, { sourceId, sourceSlug: "mock" }),
    ).resolves.toMatchObject({
      status: "skipped_duplicate",
      jobId: getCollectJobId(sourceId),
    });
    expect(deps.collectQueue.add).not.toHaveBeenCalled();
  });

  it("uses a per-source lock to prevent duplicate collect enqueue", async () => {
    const deps = createDeps({
      connection: {
        set: vi.fn().mockResolvedValue(null),
        eval: vi.fn(),
        incr: vi.fn(),
        pexpire: vi.fn(),
      },
    });

    const result = await scheduler.enqueueCollectForSource(deps, {
      sourceId,
      sourceSlug: "mock",
    });

    expect(result.status).toBe("skipped_locked");
    expect(deps.connection.set).toHaveBeenCalledWith(
      `scheduler:source:${sourceId}:lock`,
      expect.any(String),
      "PX",
      expect.any(Number),
      "NX",
    );
    expect(deps.collectQueue.add).not.toHaveBeenCalled();
  });

  it("applies per-source rateLimitRpm and audits rate-limited ticks", async () => {
    const deps = createDeps({
      prisma: {
        source: {
          findMany: vi.fn(),
          findUnique: vi
            .fn()
            .mockResolvedValue(activeSource({ rateLimitRpm: 1 })),
        },
        jobQueueAudit: { create: vi.fn().mockResolvedValue({}) },
      },
      connection: {
        set: vi.fn().mockResolvedValue("OK"),
        eval: vi.fn().mockResolvedValue(1),
        incr: vi.fn().mockResolvedValue(2),
        pexpire: vi.fn().mockResolvedValue(1),
      },
    });

    const result = await scheduler.enqueueCollectForSource(deps, {
      sourceId,
      sourceSlug: "mock",
    });

    expect(result.status).toBe("rate_limited");
    expect(deps.collectQueue.add).not.toHaveBeenCalled();
    expect(deps.prisma.jobQueueAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: "collect",
        jobId: getCollectJobId(sourceId),
        status: "rate_limited",
      }),
    });
  });

  it("skips inactive sources at tick time without creating a source run", async () => {
    const deps = createDeps({
      prisma: {
        source: {
          findMany: vi.fn(),
          findUnique: vi
            .fn()
            .mockResolvedValue(activeSource({ isActive: false })),
        },
        jobQueueAudit: { create: vi.fn().mockResolvedValue({}) },
      },
    });

    const result = await scheduler.enqueueCollectForSource(deps, {
      sourceId,
      sourceSlug: "mock",
    });

    expect(result.status).toBe("skipped_inactive");
    expect(deps.collectQueue.add).not.toHaveBeenCalled();
    expect(deps.prisma).not.toHaveProperty("sourceRun");
    expect(deps.prisma.jobQueueAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: "collect",
        jobId: getCollectJobId(sourceId),
        status: "skipped_inactive",
      }),
    });
  });
});
