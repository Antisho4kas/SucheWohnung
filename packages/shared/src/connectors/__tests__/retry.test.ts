import { describe, expect, it } from "vitest";
import {
  calculateBackoffDelayMs,
  isRetryableStatus,
  parseRetryAfter,
  resolveRetryDelayMs,
} from "../retry.js";

describe("connector retry utilities", () => {
  it("classifies retryable HTTP statuses", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it("calculates capped exponential backoff without jitter", () => {
    const policy = {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 250,
      jitter: false,
      retryStatuses: [429, 500],
    };

    expect(calculateBackoffDelayMs(1, policy)).toBe(100);
    expect(calculateBackoffDelayMs(2, policy)).toBe(200);
    expect(calculateBackoffDelayMs(3, policy)).toBe(250);
  });

  it("parses Retry-After seconds", () => {
    expect(parseRetryAfter("3", Date.now())).toBe(3000);
  });

  it("parses Retry-After HTTP dates", () => {
    const now = Date.parse("2026-06-02T12:00:00.000Z");
    const retryAt = "Tue, 02 Jun 2026 12:00:05 GMT";

    expect(parseRetryAfter(retryAt, now)).toBe(5000);
  });

  it("caps Retry-After delays with maxDelayMs", () => {
    const policy = {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      retryStatuses: [429, 500],
    };

    expect(resolveRetryDelayMs(1, policy, "60", Date.now())).toBe(1000);
  });

  it("falls back to backoff for invalid Retry-After values", () => {
    const policy = {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      retryStatuses: [429, 500],
    };

    expect(resolveRetryDelayMs(2, policy, "soon", Date.now())).toBe(200);
  });
});
