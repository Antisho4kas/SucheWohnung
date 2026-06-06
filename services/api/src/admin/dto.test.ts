import { describe, expect, it } from "vitest";
import {
  AdminCreateFilterSchema,
  AdminCreateSourceSchema,
  AdminLogsQuerySchema,
  AdminUpdateFilterSchema,
  AdminUpdateSourceSchema,
  AdminUpdateUserSchema,
  AdminUsersQuerySchema,
} from "./dto";

describe("admin DTO validation", () => {
  it("validates users and logs query limits", () => {
    expect(AdminUsersQuerySchema.parse({ limit: "200" })).toEqual({ limit: 200 });
    expect(() => AdminUsersQuerySchema.parse({ limit: "201" })).toThrow();
    expect(() => AdminUsersQuerySchema.parse({ limit: "abc" })).toThrow();
    expect(() => AdminLogsQuerySchema.parse({ limit: "501" })).toThrow();
  });

  it("validates admin user updates", () => {
    expect(AdminUpdateUserSchema.parse({ role: "admin", status: "active" })).toEqual({
      role: "admin",
      status: "active",
    });
    expect(() => AdminUpdateUserSchema.parse({ role: "support" })).toThrow();
    expect(() => AdminUpdateUserSchema.parse({ status: "verified" })).toThrow();
    expect(() => AdminUpdateUserSchema.parse({ role: "admin", passwordHash: "x" })).toThrow();
  });

  it("validates source payloads", () => {
    expect(() => AdminCreateSourceSchema.parse({ slug: {}, name: "Mock" })).toThrow();
    expect(() =>
      AdminCreateSourceSchema.parse({ slug: "mock", name: "Mock", rate_limit_rpm: -1 }),
    ).toThrow();
    expect(() =>
      AdminCreateSourceSchema.parse({
        slug: "mock",
        name: "Mock",
        config: { password: "plain-text" },
      }),
    ).toThrow();
    expect(() => AdminUpdateSourceSchema.parse({ enabled: "true" })).toThrow();
  });

  it("validates filter payloads", () => {
    expect(() =>
      AdminCreateFilterSchema.parse({ key: "price", data_type: "number", operator_set: [] }),
    ).toThrow();
    expect(() => AdminUpdateFilterSchema.parse({ operator_set: ["bad"] })).toThrow();
  });
});
