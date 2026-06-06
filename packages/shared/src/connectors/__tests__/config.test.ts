import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ConnectorBaseConfigSchema,
  createConnectorConfigSchema,
  parseConnectorConfig,
  resolveConnectorUrl,
} from "../config.js";
import { ConnectorConfigError } from "../errors.js";

describe("connector config validation", () => {
  it("applies defaults for shared connector settings", () => {
    const config = parseConnectorConfig(ConnectorBaseConfigSchema, {}, "demo");

    expect(config.timeoutMs).toBe(10_000);
    expect(config.headers).toEqual({});
    expect(config.retry.maxAttempts).toBe(3);
    expect(config.retry.retryStatuses).toContain(429);
  });

  it("rejects invalid base URLs with a connector config error", () => {
    expect(() =>
      parseConnectorConfig(
        ConnectorBaseConfigSchema,
        { baseUrl: "not-a-url" },
        "demo",
      ),
    ).toThrow(ConnectorConfigError);
  });

  it("supports connector-specific typed schema extensions", () => {
    const DemoConfigSchema = createConnectorConfigSchema({
      city: z.string().default("Berlin"),
      maxPages: z.number().int().positive().default(2),
    });

    const config = parseConnectorConfig(
      DemoConfigSchema,
      { maxPages: 4 },
      "demo",
    );

    expect(config.city).toBe("Berlin");
    expect(config.maxPages).toBe(4);
    expect(config.timeoutMs).toBe(10_000);
  });

  it("resolves relative paths against a connector base URL", () => {
    expect(
      resolveConnectorUrl("https://example.com/api", "/listings?page=1"),
    ).toBe("https://example.com/listings?page=1");
    expect(resolveConnectorUrl("https://example.com/api/", "health")).toBe(
      "https://example.com/api/health",
    );
  });
});
