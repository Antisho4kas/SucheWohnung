import { describe, expect, it } from "vitest";
import {
  isMetricsPubliclyEnabled,
  isRefreshCookieSecure,
  isSwaggerEnabled,
} from "./configuration";

describe("API production surface gating", () => {
  it("disables Swagger by default in staging and production", () => {
    expect(isSwaggerEnabled({ NODE_ENV: "staging" })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("keeps Swagger available by default outside staging and production", () => {
    expect(isSwaggerEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: "test" })).toBe(true);
  });

  it("only exposes Swagger in production when explicitly enabled", () => {
    expect(
      isSwaggerEnabled({
        NODE_ENV: "production",
        API_SWAGGER_ENABLED: true,
      }),
    ).toBe(true);
  });

  it("only exposes metrics publicly when explicitly enabled", () => {
    expect(isMetricsPubliclyEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isMetricsPubliclyEnabled({ NODE_ENV: "staging" })).toBe(false);
    expect(
      isMetricsPubliclyEnabled({
        NODE_ENV: "production",
        METRICS_PUBLIC_ENABLED: true,
      }),
    ).toBe(true);
  });

  it("uses secure refresh cookies by default only in staging and production", () => {
    expect(isRefreshCookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(isRefreshCookieSecure({ NODE_ENV: "test" })).toBe(false);
    expect(isRefreshCookieSecure({ NODE_ENV: "staging" })).toBe(true);
    expect(isRefreshCookieSecure({ NODE_ENV: "production" })).toBe(true);
  });

  it("allows explicit refresh cookie secure override", () => {
    expect(
      isRefreshCookieSecure({
        NODE_ENV: "production",
        AUTH_REFRESH_COOKIE_SECURE: false,
      }),
    ).toBe(false);
    expect(
      isRefreshCookieSecure({
        NODE_ENV: "development",
        AUTH_REFRESH_COOKIE_SECURE: "true",
      }),
    ).toBe(true);
  });
});
