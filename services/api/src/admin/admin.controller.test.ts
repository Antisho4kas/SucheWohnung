import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.module";

describe("AdminController source contracts", () => {
  it("returns admin sources with health, breaker state, listings_count, and latest run metrics", async () => {
    const startedAt = new Date("2026-06-03T10:00:00.000Z");
    const finishedAt = new Date("2026-06-03T10:01:30.000Z");
    const prisma = {
      source: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "src-1",
            slug: "mock",
            name: "Mock",
            isActive: true,
            breakerState: "closed",
            _count: { listings: 7 },
            runs: [
              {
                id: "run-1",
                sourceId: "src-1",
                status: "partial",
                itemsFetched: 12,
                itemsNew: 3,
                itemsUpdated: 2,
                errors: 1,
                startedAt,
                finishedAt,
              },
            ],
          },
          {
            id: "src-2",
            slug: "idle",
            name: "Idle",
            isActive: true,
            breakerState: "closed",
            _count: { listings: 0 },
            runs: [],
          },
        ]),
      },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(controller.sources()).resolves.toEqual({
      data: [
        {
          id: "src-1",
          slug: "mock",
          name: "Mock",
          is_active: true,
          enabled: true,
          breaker_state: "closed",
          registered: true,
          lifecycle_status: "permission-needed",
          activation_approved: false,
          activation_block_reason: null,
          activatable: false,
          activation_block_reasons: [
            'Source lifecycle status "permission-needed" blocks activation',
            'Source activationApproved must be true for lifecycle status "permission-needed"',
          ],
          health: "degraded",
          listings_count: 7,
          last_run_status: "partial",
          items_fetched: 12,
          items_new: 3,
          items_updated: 2,
          errors: 1,
          last_run: {
            id: "run-1",
            source_id: "src-1",
            status: "partial",
            items_fetched: 12,
            items_new: 3,
            items_updated: 2,
            errors: 1,
            started_at: "2026-06-03T10:00:00.000Z",
            finished_at: "2026-06-03T10:01:30.000Z",
          },
        },
        {
          id: "src-2",
          slug: "idle",
          name: "Idle",
          is_active: true,
          enabled: true,
          breaker_state: "closed",
          registered: false,
          lifecycle_status: "permission-needed",
          activation_approved: false,
          activation_block_reason: null,
          activatable: false,
          activation_block_reasons: [
            'No connector registered for source slug "idle"',
            'Source lifecycle status "permission-needed" blocks activation',
            'Source activationApproved must be true for lifecycle status "permission-needed"',
          ],
          health: "unknown",
          listings_count: 0,
          last_run_status: null,
          items_fetched: 0,
          items_new: 0,
          items_updated: 0,
          errors: 0,
          last_run: null,
        },
      ],
    });
    expect(prisma.source.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { listings: true } },
        runs: {
          where: { finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });
  });

  it("derives source health from active flag, breaker state, and last run", async () => {
    const now = new Date("2026-06-03T12:00:00.000Z");
    const run = (status: string, errors = 0) => [
      {
        id: `run-${status}`,
        sourceId: `src-${status}`,
        status,
        itemsFetched: 1,
        itemsNew: 1,
        itemsUpdated: 0,
        errors,
        startedAt: now,
        finishedAt: now,
      },
    ];
    const prisma = {
      source: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "src-success",
            slug: "success",
            name: "Success",
            isActive: true,
            breakerState: "closed",
            _count: { listings: 1 },
            runs: run("success"),
          },
          {
            id: "src-failed",
            slug: "failed",
            name: "Failed",
            isActive: true,
            breakerState: "closed",
            _count: { listings: 1 },
            runs: run("failed", 2),
          },
          {
            id: "src-open",
            slug: "open",
            name: "Open",
            isActive: true,
            breakerState: "open",
            _count: { listings: 1 },
            runs: run("success"),
          },
          {
            id: "src-half-open",
            slug: "half-open",
            name: "Half Open",
            isActive: true,
            breakerState: "half_open",
            _count: { listings: 1 },
            runs: run("success"),
          },
          {
            id: "src-paused",
            slug: "paused",
            name: "Paused",
            isActive: false,
            breakerState: "closed",
            _count: { listings: 1 },
            runs: [],
          },
        ]),
      },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(controller.sources()).resolves.toMatchObject({
      data: [
        { slug: "success", health: "healthy" },
        { slug: "failed", health: "failing" },
        { slug: "open", health: "failing" },
        { slug: "half-open", health: "degraded" },
        { slug: "paused", health: "paused", last_run: null },
      ],
    });
  });

  it("returns the same normalized source shape after toggling", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: "src-1", isActive: true }),
        update: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          name: "Mock",
          isActive: false,
          breakerState: "closed",
          _count: { listings: 7 },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.toggleSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
      ),
    ).resolves.toEqual({
      data: {
        id: "src-1",
        slug: "mock",
        name: "Mock",
        is_active: false,
        enabled: false,
        breaker_state: "closed",
        registered: true,
        lifecycle_status: "permission-needed",
        activation_approved: false,
        activation_block_reason: null,
        activatable: false,
        activation_block_reasons: [
          'Source lifecycle status "permission-needed" blocks activation',
          'Source activationApproved must be true for lifecycle status "permission-needed"',
        ],
        health: "paused",
        listings_count: 7,
        last_run_status: null,
        items_fetched: 0,
        items_new: 0,
        items_updated: 0,
        errors: 0,
        last_run: null,
      },
    });
  });

  it("uses a conditional update to prevent concurrent super_admin mutation", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "target-1",
          role: "user",
          status: "active",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.updateUser(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "target-1",
        { status: "suspended" },
      ),
    ).rejects.toThrow("super_admin role is required");

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "target-1", role: { not: "super_admin" } },
      data: { role: undefined, status: "suspended" },
    });
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows feature-flagged super_admin actors to mutate super_admin state", async () => {
    const originalFlag = process.env.SUPER_ADMIN_MUTATIONS_ENABLED;
    process.env.SUPER_ADMIN_MUTATIONS_ENABLED = "true";
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "target-1",
          role: "super_admin",
          status: "active",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "target-1",
          role: "super_admin",
          status: "suspended",
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    try {
      await expect(
        controller.updateUser(
          { sub: "root-1", email: "root@example.com", role: "super_admin" },
          "target-1",
          { status: "suspended" },
        ),
      ).resolves.toEqual({
        data: { id: "target-1", role: "super_admin", status: "suspended" },
      });
    } finally {
      if (originalFlag === undefined)
        delete process.env.SUPER_ADMIN_MUTATIONS_ENABLED;
      else process.env.SUPER_ADMIN_MUTATIONS_ENABLED = originalFlag;
    }

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: { role: undefined, status: "suspended" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("activates a registered beta-approved source", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          isActive: false,
          config: { lifecycleStatus: "beta", activationApproved: true },
        }),
        update: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          name: "Mock",
          isActive: true,
          breakerState: "closed",
          config: { lifecycleStatus: "beta", activationApproved: true },
          _count: { listings: 0 },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.toggleSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
      ),
    ).resolves.toMatchObject({
      data: { slug: "mock", is_active: true, lifecycle_status: "beta" },
    });
    expect(prisma.source.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });

  it("rejects activation for sources without a registered runtime connector", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "unregistered",
          isActive: false,
          config: { lifecycleStatus: "ready", activationApproved: true },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.toggleSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
      ),
    ).rejects.toThrow('No connector registered for source slug "unregistered"');
    expect(prisma.source.update).not.toHaveBeenCalled();
  });

  it("rejects activation for blocked sources", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          isActive: false,
          config: { lifecycleStatus: "blocked", activationApproved: true },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.toggleSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
      ),
    ).rejects.toThrow('Source lifecycle status "blocked" blocks activation');
    expect(prisma.source.update).not.toHaveBeenCalled();
  });

  it("activates through PATCH only when persisted lifecycle state is approved", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          isActive: false,
          config: { lifecycleStatus: "ready", activationApproved: true },
        }),
        update: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          name: "Mock",
          isActive: true,
          breakerState: "closed",
          config: { lifecycleStatus: "ready", activationApproved: true },
          _count: { listings: 0 },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.updateSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
        { is_active: true },
      ),
    ).resolves.toMatchObject({ data: { slug: "mock", is_active: true } });
  });

  it("rejects PATCH attempts to self-approve and activate a source", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          isActive: false,
          config: {
            lifecycleStatus: "permission-needed",
            activationApproved: false,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(
      controller.updateSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
        {
          is_active: true,
          config: { lifecycleStatus: "ready", activationApproved: true },
        },
      ),
    ).rejects.toThrow(
      'Source lifecycle metadata "lifecycleStatus" is managed outside generic source config',
    );
    expect(prisma.source.update).not.toHaveBeenCalled();
  });

  it("rejects manual runs for inactive or unapproved sources", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          isActive: false,
          config: { lifecycleStatus: "ready", activationApproved: true },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const queue = { enqueueCollect: vi.fn().mockResolvedValue({}) };
    const controller = new AdminController(prisma as never, queue as never);

    await expect(
      controller.runSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
      ),
    ).rejects.toThrow("Source must be active before manual run");
    expect(queue.enqueueCollect).not.toHaveBeenCalled();
  });

  it("enqueues manual runs only for active approved sources", async () => {
    const prisma = {
      source: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "src-1",
          slug: "mock",
          isActive: true,
          config: { lifecycleStatus: "ready", activationApproved: true },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const queue = { enqueueCollect: vi.fn().mockResolvedValue({}) };
    const controller = new AdminController(prisma as never, queue as never);

    await expect(
      controller.runSource(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "src-1",
      ),
    ).resolves.toEqual({ data: { enqueued: true, source: "mock" } });
    expect(queue.enqueueCollect).toHaveBeenCalledWith("mock");
  });

  it("returns source runs as normalized snake_case DTOs", async () => {
    const prisma = {
      sourceRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            sourceId: "src-1",
            status: "running",
            itemsFetched: 5,
            itemsNew: 2,
            itemsUpdated: 1,
            errors: 0,
            startedAt: new Date("2026-06-03T10:00:00.000Z"),
            finishedAt: null,
          },
        ]),
      },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(controller.runs("src-1")).resolves.toEqual({
      data: [
        {
          id: "run-1",
          source_id: "src-1",
          status: "running",
          items_fetched: 5,
          items_new: 2,
          items_updated: 1,
          errors: 0,
          started_at: "2026-06-03T10:00:00.000Z",
          finished_at: null,
        },
      ],
    });
    expect(prisma.sourceRun.findMany).toHaveBeenCalledWith({
      where: { sourceId: "src-1" },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  });

  it("returns queue counts with computed depth", async () => {
    const queue = {
      getCounts: vi.fn().mockResolvedValue({
        collect: {
          waiting: 4,
          active: 2,
          delayed: 3,
          failed: 1,
          completed: 20,
        },
        match: { waiting: 0, active: 0 },
        notify: { waiting: 1, active: 0, delayed: 0, failed: 0, completed: 5 },
        telegram: {
          waiting: 2,
          active: 1,
          delayed: 4,
          failed: 3,
          completed: 8,
        },
      }),
    };
    const controller = new AdminController({} as never, queue as never);

    await expect(controller.queues()).resolves.toEqual({
      data: {
        collect: {
          waiting: 4,
          active: 2,
          delayed: 3,
          failed: 1,
          completed: 20,
          depth: 4,
        },
        match: {
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
          completed: 0,
          depth: 0,
        },
        notify: {
          waiting: 1,
          active: 0,
          delayed: 0,
          failed: 0,
          completed: 5,
          depth: 1,
        },
        telegram: {
          waiting: 2,
          active: 1,
          delayed: 4,
          failed: 3,
          completed: 8,
          depth: 2,
        },
      },
    });
  });

  it("rejects invalid queue retry requests with 400 before retrying or auditing", async () => {
    const prisma = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const queue = { retryFailed: vi.fn().mockResolvedValue(0) };
    const controller = new AdminController(prisma as never, queue as never);

    await expect(
      controller.retry(
        { sub: "admin-1", email: "a@example.com", role: "admin" },
        "unknown",
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(queue.retryFailed).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns audit logs as safe admin DTOs instead of raw Prisma shape", async () => {
    const createdAt = new Date("2026-06-03T13:00:00.000Z");
    const prisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "log-1",
            actorId: "actor-1",
            action: "admin.queue.retry",
            meta: { queue: "collect", retried: 2 },
            createdAt,
            actor: { email: "admin@example.com" },
          },
        ]),
      },
    };
    const controller = new AdminController(prisma as never, {} as never);

    await expect(controller.logs({ limit: 100 })).resolves.toEqual({
      data: [
        {
          id: "log-1",
          actor_id: "actor-1",
          user_email: "admin@example.com",
          action: "admin.queue.retry",
          meta: { queue: "collect", retried: 2 },
          details: '{"queue":"collect","retried":2}',
          created_at: "2026-06-03T13:00:00.000Z",
        },
      ],
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        actorId: true,
        action: true,
        meta: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    });
  });
});
