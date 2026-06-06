import { describe, expect, it } from "vitest";
import { ListingIdParamSchema, ListingSearchQuerySchema } from "./dto";

describe("listings DTO validation", () => {
  it("validates listing search numeric query parameters", () => {
    expect(ListingSearchQuerySchema.parse({ price_max: "1200", limit: "50" })).toEqual({
      price_max: 1200,
      limit: 50,
    });
    expect(() => ListingSearchQuerySchema.parse({ price_max: "abc" })).toThrow();
    expect(() => ListingSearchQuerySchema.parse({ price_min: "-1" })).toThrow();
    expect(() => ListingSearchQuerySchema.parse({ rooms_min: "-1" })).toThrow();
    expect(() => ListingSearchQuerySchema.parse({ area_min: "NaN" })).toThrow();
    expect(() => ListingSearchQuerySchema.parse({ limit: "101" })).toThrow();
    expect(() => ListingSearchQuerySchema.parse({ price_min: "1300", price_max: "1200" })).toThrow();
  });

  it("validates listing UUID params", () => {
    expect(() => ListingIdParamSchema.parse({ id: "not-a-uuid" })).toThrow();
  });
});
