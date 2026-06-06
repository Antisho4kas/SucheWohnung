import { vi } from "vitest";

export function createQueueMock(overrides: Record<string, unknown> = {}) {
  return {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    getJob: vi.fn().mockResolvedValue(null),
    getJobs: vi.fn().mockResolvedValue([]),
    getJobSchedulers: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
    upsertJobScheduler: vi.fn().mockResolvedValue({ id: "scheduler-1" }),
    getFailed: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createRedisConnectionMock(overrides: Record<string, unknown> = {}) {
  return {
    eval: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue("OK"),
    quit: vi.fn().mockResolvedValue("OK"),
    ...overrides,
  };
}

export function createWorkerJob<TData>(
  data: TData,
  overrides: Record<string, unknown> = {},
) {
  return {
    data,
    attemptsMade: 0,
    opts: { attempts: 5 },
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export class TestDelayedError extends Error {
  constructor() {
    super("Delayed");
    this.name = "DelayedError";
  }
}
