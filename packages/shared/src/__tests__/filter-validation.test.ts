import { describe, expect, it } from "vitest";
import { SEED_FILTER_DEFINITIONS } from "../filters/registry.js";
import { validateProfileFilters } from "../filters/validation.js";
import type { ProfileFilter } from "../filters/types.js";

function errorsFor(filters: ProfileFilter[]) {
  const result = validateProfileFilters(filters, SEED_FILTER_DEFINITIONS);
  expect(result.success).toBe(false);
  return result.success ? [] : result.errors;
}

describe("profile filter semantic validation", () => {
  it("accepts all currently seeded data types and supported arrays", () => {
    const filters: ProfileFilter[] = [
      { key: "city", operator: "eq", value: "Berlin" },
      { key: "postal_code", operator: "in", value: ["10115", "10117"] },
      { key: "bundesland", operator: "in", value: ["Berlin", "Bayern"] },
      { key: "price", operator: "gte", value: 800 },
      { key: "price", operator: "lte", value: 1300 },
      { key: "area", operator: "gte", value: 45 },
      { key: "rooms", operator: "gte", value: 2.5 },
      { key: "provisionfrei", operator: "eq", value: true },
      {
        key: "location",
        operator: "within",
        value: { lat: 52.52, lng: 13.405, radius_km: 5 },
      },
    ];

    expect(validateProfileFilters(filters, SEED_FILTER_DEFINITIONS)).toEqual({
      success: true,
      filters,
    });
  });

  it("rejects invalid string values for numeric filters", () => {
    expect(
      errorsFor([{ key: "price", operator: "lte", value: "abc" }]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value",
          issue: "must be a finite number",
        }),
      ]),
    );
  });

  it("rejects numeric values outside configured bounds", () => {
    expect(errorsFor([{ key: "price", operator: "lte", value: -1 }])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value",
          issue: "must be >= 0",
        }),
      ]),
    );
  });

  it("rejects empty text values", () => {
    expect(errorsFor([{ key: "city", operator: "eq", value: "   " }])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value",
          issue: "must be a non-empty string",
        }),
      ]),
    );
  });

  it("rejects non-boolean values for boolean filters", () => {
    expect(
      errorsFor([{ key: "provisionfrei", operator: "eq", value: "true" }]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value",
          issue: "must be a boolean",
        }),
      ]),
    );
  });

  it("rejects enum values outside configured allowed values", () => {
    expect(
      errorsFor([{ key: "bundesland", operator: "eq", value: "Atlantis" }]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value",
          issue: expect.stringContaining("must be one of"),
        }),
      ]),
    );
  });

  it("rejects malformed location filters", () => {
    expect(
      errorsFor([
        {
          key: "location",
          operator: "within",
          value: { lat: "52.52", lng: 13.405, radius_km: 5 },
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].value.lat",
          issue: "must be a finite number",
        }),
      ]),
    );
  });

  it("rejects unknown filter keys", () => {
    expect(
      errorsFor([{ key: "provision_free", operator: "eq", value: true }]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].key",
          issue: "unknown filter key",
        }),
      ]),
    );
  });

  it("rejects disallowed operators", () => {
    expect(
      errorsFor([{ key: "provisionfrei", operator: "gte", value: 1 }]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "filters[0].operator",
          issue: "operator is not allowed for this filter",
        }),
      ]),
    );
  });

  it("rejects inconsistent numeric ranges", () => {
    for (const key of ["price", "area", "rooms"] as const) {
      expect(
        errorsFor([
          { key, operator: "gte", value: 100 },
          { key, operator: "lte", value: 50 },
        ]),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: key,
            issue: "gte must be <= lte",
          }),
        ]),
      );
    }
  });
});
