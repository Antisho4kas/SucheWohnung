import { describe, it, expect } from "vitest";
import { runQualityGate } from "../ingestion/quality-gate.js";

const valid = {
  sourceSlug: "mock",
  externalId: "1",
  url: "https://example.com/1",
  price: 1200,
  area: 60,
  rooms: 2,
  postalCode: "10115",
  city: "Berlin",
};

describe("quality gate (§9.8)", () => {
  it("passes a valid listing", () => {
    const r = runQualityGate(valid);
    expect(r.ok).toBe(true);
    expect(r.listing?.dealType).toBe("rent");
  });

  it("rejects price out of sanity range", () => {
    expect(runQualityGate({ ...valid, price: 5 }).ok).toBe(false);
  });

  it("rejects malformed PLZ", () => {
    expect(runQualityGate({ ...valid, postalCode: "ABC" }).ok).toBe(false);
  });

  it("rejects geo outside Germany", () => {
    expect(runQualityGate({ ...valid, geo: { lat: 0, lng: 0 } }).ok).toBe(false);
  });

  it("requires price or warmRent", () => {
    const { price: _price, ...noPrice } = valid;
    expect(runQualityGate(noPrice).ok).toBe(false);
  });
});
