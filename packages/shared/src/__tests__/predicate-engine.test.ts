import { describe, it, expect } from "vitest";
import { evaluateProfile } from "../matching/predicate-engine.js";
import {
  SEED_FILTER_DEFINITIONS,
  buildFilterIndex,
} from "../filters/registry.js";
import type { NormalizedListing } from "../domain/listing.js";
import type { FilterDefinition, ProfileFilter } from "../filters/types.js";

const index = buildFilterIndex(SEED_FILTER_DEFINITIONS);

const baseListing: NormalizedListing = {
  sourceSlug: "mock",
  externalId: "1",
  url: "https://example.com/1",
  dealType: "rent",
  price: 1200,
  area: 60,
  rooms: 2.5,
  city: "Berlin",
  bundesland: "Berlin",
  postalCode: "10115",
  geo: { lat: 52.52, lng: 13.405 },
  attributes: { balcony: true, elevator: false },
  images: [],
};

describe("predicate engine (§10.3)", () => {
  it("matches when all filters pass (AND-composition)", () => {
    const filters: ProfileFilter[] = [
      { key: "city", operator: "eq", value: "Berlin" },
      { key: "price", operator: "lte", value: 1300 },
      { key: "rooms", operator: "gte", value: 2 },
      { key: "balcony", operator: "eq", value: true },
    ];
    const res = evaluateProfile(baseListing, filters, index);
    expect(res.matched).toBe(true);
    expect(res.failedKeys).toHaveLength(0);
  });

  it("fails when price exceeds lte", () => {
    const filters: ProfileFilter[] = [
      { key: "price", operator: "lte", value: 1000 },
    ];
    const res = evaluateProfile(baseListing, filters, index);
    expect(res.matched).toBe(false);
    expect(res.failedKeys).toContain("price");
  });

  it("fails a positive boolean constraint when attribute is false", () => {
    const filters: ProfileFilter[] = [
      { key: "elevator", operator: "eq", value: true },
    ];
    expect(evaluateProfile(baseListing, filters, index).matched).toBe(false);
  });

  it("fails a missing attribute against a positive constraint", () => {
    const filters: ProfileFilter[] = [
      { key: "parking", operator: "eq", value: true },
    ];
    expect(evaluateProfile(baseListing, filters, index).matched).toBe(false);
  });

  it("supports geo within radius (haversine)", () => {
    const near: ProfileFilter[] = [
      {
        key: "location",
        operator: "within",
        value: { lat: 52.5, lng: 13.4, radius_km: 5 },
      },
    ];
    expect(evaluateProfile(baseListing, near, index).matched).toBe(true);

    const far: ProfileFilter[] = [
      {
        key: "location",
        operator: "within",
        value: { lat: 48.137, lng: 11.575, radius_km: 5 },
      },
    ];
    expect(evaluateProfile(baseListing, far, index).matched).toBe(false);
  });

  it("fails geo radius filters when listing coordinates are missing", () => {
    const filters: ProfileFilter[] = [
      {
        key: "location",
        operator: "within",
        value: { lat: 52.5, lng: 13.4, radius_km: 5 },
      },
    ];
    const listingWithoutGeo: NormalizedListing = {
      ...baseListing,
      geo: undefined,
    };

    expect(evaluateProfile(listingWithoutGeo, filters, index).matched).toBe(
      false,
    );
  });

  it("supports custom DB-style filter definitions from the runtime index", () => {
    const customDefinitions: FilterDefinition[] = [
      {
        key: "garden",
        label: { en: "Garden" },
        dataType: "bool",
        operatorSet: ["eq"],
        binding: { attribute: "garden" },
      },
    ];
    const filters: ProfileFilter[] = [
      { key: "garden", operator: "eq", value: true },
    ];

    expect(
      evaluateProfile(baseListing, filters, buildFilterIndex(customDefinitions))
        .matched,
    ).toBe(false);
    expect(
      evaluateProfile(
        {
          ...baseListing,
          attributes: { ...baseListing.attributes, garden: true },
        },
        filters,
        buildFilterIndex(customDefinitions),
      ).matched,
    ).toBe(true);
  });

  it("supports `in` operator on city", () => {
    const filters: ProfileFilter[] = [
      { key: "city", operator: "in", value: ["Hamburg", "Berlin"] },
    ];
    expect(evaluateProfile(baseListing, filters, index).matched).toBe(true);
  });

  it("rejects an operator not in the definition's operator set", () => {
    const filters: ProfileFilter[] = [
      { key: "balcony", operator: "gte", value: 1 },
    ];
    expect(evaluateProfile(baseListing, filters, index).matched).toBe(false);
  });
});
