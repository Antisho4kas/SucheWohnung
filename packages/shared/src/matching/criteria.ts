import type { ProfileFilter } from "../filters/types.js";

/**
 * Denormalized `criteria` JSONB snapshot (§07 search_profiles.criteria, §10.3).
 * Used for the coarse SQL prefilter (GIN-indexed) before the precise
 * predicate-engine pass. Shape mirrors the SQL in §10.3.
 *
 * Example:
 *   { city: "Berlin", price: { lte: 1300 }, rooms: { gte: 2 },
 *     location: { lat, lng, radius_km }, attrs: { balcony: true } }
 */
export type Criteria = Record<string, unknown>;

const NUMERIC_KEYS = new Set(["price", "area", "rooms"]);

export function buildCriteria(filters: readonly ProfileFilter[]): Criteria {
  const criteria: Criteria = {};
  const attrs: Record<string, unknown> = {};

  for (const f of filters) {
    if (NUMERIC_KEYS.has(f.key)) {
      const bucket = (criteria[f.key] as Record<string, unknown>) ?? {};
      bucket[f.operator] = f.value;
      criteria[f.key] = bucket;
    } else if (f.key === "location" && f.operator === "within") {
      criteria.location = f.value;
    } else if (["city", "bundesland", "postal_code"].includes(f.key)) {
      criteria[f.key] = f.value;
    } else {
      // boolean / extensible attributes
      attrs[f.key] = f.value;
    }
  }

  if (Object.keys(attrs).length > 0) {
    criteria.attrs = attrs;
  }
  return criteria;
}
