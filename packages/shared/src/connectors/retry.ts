export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: boolean;
  readonly retryStatuses: readonly number[];
}

export const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504] as const;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: true,
  retryStatuses: DEFAULT_RETRY_STATUSES,
};

export type RetryPolicyInput = Partial<RetryPolicy>;

export function normalizeRetryPolicy(
  input: RetryPolicyInput = {},
): RetryPolicy {
  const maxAttempts = input.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts;
  const baseDelayMs = input.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs;
  const maxDelayMs = input.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;
  const retryStatuses =
    input.retryStatuses ?? DEFAULT_RETRY_POLICY.retryStatuses;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("retry.maxAttempts must be an integer >= 1");
  }
  if (!Number.isInteger(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError("retry.baseDelayMs must be a non-negative integer");
  }
  if (!Number.isInteger(maxDelayMs) || maxDelayMs < 0) {
    throw new RangeError("retry.maxDelayMs must be a non-negative integer");
  }
  if (!Array.isArray(retryStatuses) || retryStatuses.length === 0) {
    throw new RangeError("retry.retryStatuses must be a non-empty array");
  }
  if (
    retryStatuses.some(
      (status) => !Number.isInteger(status) || status < 100 || status > 599,
    )
  ) {
    throw new RangeError("retry.retryStatuses must contain HTTP status codes");
  }

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitter: input.jitter ?? DEFAULT_RETRY_POLICY.jitter,
    retryStatuses,
  };
}

export function isRetryableStatus(
  status: number,
  retryStatuses: readonly number[] = DEFAULT_RETRY_STATUSES,
): boolean {
  return retryStatuses.includes(status);
}

export function calculateBackoffDelayMs(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, attempt - 1);
  const rawDelay = policy.baseDelayMs * 2 ** exponent;
  const capped = Math.min(rawDelay, policy.maxDelayMs);
  if (!policy.jitter) return capped;

  const jitterMultiplier = 0.5 + random();
  return Math.min(Math.round(capped * jitterMultiplier), policy.maxDelayMs);
}

export function parseRetryAfter(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1000);

  const retryAtMs = Date.parse(trimmed);
  if (Number.isNaN(retryAtMs)) return undefined;

  return Math.max(0, retryAtMs - nowMs);
}

export function resolveRetryDelayMs(
  attempt: number,
  policy: RetryPolicy,
  retryAfter: string | null | undefined,
  nowMs: number = Date.now(),
  random: () => number = Math.random,
): number {
  const retryAfterDelay = parseRetryAfter(retryAfter, nowMs);
  if (retryAfterDelay !== undefined)
    return Math.min(retryAfterDelay, policy.maxDelayMs);
  return calculateBackoffDelayMs(attempt, policy, random);
}
