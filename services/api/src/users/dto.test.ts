import { describe, expect, it } from "vitest";
import { SetConsentSchema, UpdateMeSchema } from "./dto";

describe("users DTO validation", () => {
  it("validates account update payloads", () => {
    expect(UpdateMeSchema.parse({ locale: "de" })).toEqual({ locale: "de" });
    expect(() => UpdateMeSchema.parse({ locale: "de", role: "admin" })).toThrow();
    expect(() => UpdateMeSchema.parse({ locale: "fr" })).toThrow();
  });

  it("validates consent payloads", () => {
    expect(SetConsentSchema.parse({ consent_type: "marketing", granted: true })).toEqual({
      consent_type: "marketing",
      granted: true,
    });
    expect(() =>
      SetConsentSchema.parse({ consent_type: "marketing", granted: "true" }),
    ).toThrow();
  });
});
