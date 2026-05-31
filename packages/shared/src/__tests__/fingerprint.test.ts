import { describe, it, expect } from "vitest";
import {
  computeFingerprint,
  computeSoftFingerprint,
} from "../ingestion/fingerprint.js";
import type { NormalizedListing } from "../domain/listing.js";

const make = (over: Partial<NormalizedListing>): NormalizedListing => ({
  sourceSlug: "mock",
  externalId: "abc",
  url: "https://example.com/x",
  dealType: "rent",
  price: 1000,
  area: 50,
  rooms: 2,
  postalCode: "10115",
  attributes: {},
  images: [],
  ...over,
});

describe("fingerprint (§7.5)", () => {
  it("is stable for the same external id + source", () => {
    expect(computeFingerprint(make({}))).toBe(computeFingerprint(make({})));
  });

  it("differs across sources for the same external id", () => {
    expect(computeFingerprint(make({ sourceSlug: "a" }))).not.toBe(
      computeFingerprint(make({ sourceSlug: "b" })),
    );
  });

  it("falls back to content hash when external id is empty", () => {
    const a = computeFingerprint(make({ externalId: "" }));
    const b = computeFingerprint(make({ externalId: "", price: 2000 }));
    expect(a).not.toBe(b);
  });

  it("soft fingerprint buckets near prices/areas together", () => {
    const a = computeSoftFingerprint(make({ price: 1000, area: 50 }));
    const b = computeSoftFingerprint(make({ price: 1010, area: 50.4 }));
    expect(a).toBe(b);
  });

  it("soft fingerprint differs for clearly different listings", () => {
    const a = computeSoftFingerprint(make({ price: 1000, area: 50 }));
    const b = computeSoftFingerprint(make({ price: 2000, area: 90 }));
    expect(a).not.toBe(b);
  });
});
