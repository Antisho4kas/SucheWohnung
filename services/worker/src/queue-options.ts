export const COLLECT_QUEUE_NAME = "collect";
export const SCHEDULER_QUEUE_NAME = "scheduler";

export const COLLECT_JOB_NAME = "collect";
export const SCHEDULE_SOURCE_JOB_NAME = "schedule-source";
export const SYNC_SOURCES_JOB_NAME = "sync-sources";

export const SOURCES_SYNC_SCHEDULER_ID = "sources-sync";

export const COLLECT_JOB_ATTEMPTS = 3;
export const COLLECT_JOB_BACKOFF_MS = 5_000;

export const COLLECT_JOB_OPTIONS = {
  attempts: COLLECT_JOB_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: COLLECT_JOB_BACKOFF_MS, jitter: 0.2 },
  removeOnComplete: true,
  removeOnFail: true,
};

export const SCHEDULER_TICK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000, jitter: 0.2 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export const SOURCES_SYNC_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000, jitter: 0.2 },
  removeOnComplete: 100,
  removeOnFail: 1_000,
};

export function getCollectJobId(sourceId: string): string {
  return `${COLLECT_JOB_NAME}-${sourceId}`;
}

export function getSourceSchedulerId(sourceId: string): string {
  return `source-${sourceId}`;
}
