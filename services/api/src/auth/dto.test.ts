import { describe, expect, it } from "vitest";
import { LoginSchema, RefreshSchema, RegisterSchema } from "./dto";

describe("auth DTO contracts", () => {
  it("accepts login email/password payloads", () => {
    expect(
      LoginSchema.parse({ email: "user@example.com", password: "secret" }),
    ).toEqual({
      email: "user@example.com",
      password: "secret",
    });
  });

  it("accepts register email/password payloads and optional locale", () => {
    expect(
      RegisterSchema.parse({
        email: "user@example.com",
        password: "secret123",
        locale: "de",
      }),
    ).toEqual({
      email: "user@example.com",
      password: "secret123",
      locale: "de",
    });
  });

  it("accepts cookie-based refresh payloads and legacy body refresh tokens", () => {
    expect(RefreshSchema.parse({})).toEqual({});
    expect(RefreshSchema.parse({ refresh_token: "refresh-token" })).toEqual({
      refresh_token: "refresh-token",
    });
    expect(() => RefreshSchema.parse({ refresh: "refresh-token" })).toThrow();
  });
});
