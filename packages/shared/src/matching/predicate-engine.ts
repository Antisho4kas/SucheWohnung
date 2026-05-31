import type { NormalizedListing } from "../domain/listing.js";
import type {
  FilterDefinition,
  FilterOperator,
  ProfileFilter,
} from "../filters/types.js";
import { GeoWithinValueSchema } from "../filters/types.js";
import { haversineKm } from "./geo.js";

/**
 * Generic predicate engine (§10.3 step 2 — "точная проверка").
 *
 * It is intentionally agnostic of *which* filters exist: it resolves the value
 * to compare from the listing using the FilterDefinition binding, then applies
 * the operator according to the filter's data_type. New filters never require
 * touching this code (§18.5 invariant).
 */

export interface MatchResult {
  readonly matched: boolean;
  /** keys of filters that failed — useful for debugging / admin QA. */
  readonly failedKeys: string[];
}

function resolveListingValue(
  listing: NormalizedListing,
  def: FilterDefinition,
): unknown {
  if (def.binding.attribute) {
    return listing.attributes?.[def.binding.attribute];
  }
  const col = def.binding.column;
  if (!col) return undefined;
  // geo is a special-case nested object on the listing
  return (listing as unknown as Record<string, unknown>)[col];
}

function compareScalar(
  operator: FilterOperator,
  listingValue: unknown,
  filterValue: unknown,
): boolean {
  switch (operator) {
    case "eq":
      return listingValue === filterValue;
    case "gte":
      return (
        typeof listingValue === "number" &&
        typeof filterValue === "number" &&
        listingValue >= filterValue
      );
    case "lte":
      return (
        typeof listingValue === "number" &&
        typeof filterValue === "number" &&
        listingValue <= filterValue
      );
    case "in":
      return Array.isArray(filterValue) && filterValue.includes(listingValue);
    case "within":
      return false; // handled separately
    default:
      return false;
  }
}

function evaluateOne(
  listing: NormalizedListing,
  def: FilterDefinition,
  filter: ProfileFilter,
): boolean {
  // Operator must be allowed by the definition's operator set.
  if (!def.operatorSet.includes(filter.operator)) return false;

  if (def.dataType === "geo" && filter.operator === "within") {
    const parsed = GeoWithinValueSchema.safeParse(filter.value);
    if (!parsed.success) return false;
    if (!listing.geo) return false;
    const dist = haversineKm(listing.geo, {
      lat: parsed.data.lat,
      lng: parsed.data.lng,
    });
    return dist <= parsed.data.radius_km;
  }

  const listingValue = resolveListingValue(listing, def);

  // A listing missing the field can never satisfy a positive constraint.
  if (listingValue === undefined || listingValue === null) return false;

  return compareScalar(filter.operator, listingValue, filter.value);
}

/**
 * Evaluate ALL filters of a profile against a listing (AND-composition, §10.2).
 * Returns matched=true only if every filter passes.
 */
export function evaluateProfile(
  listing: NormalizedListing,
  filters: readonly ProfileFilter[],
  filterIndex: ReadonlyMap<string, FilterDefinition>,
): MatchResult {
  const failedKeys: string[] = [];
  for (const filter of filters) {
    const def = filterIndex.get(filter.key);
    if (!def || def.isActive === false) {
      failedKeys.push(filter.key);
      continue;
    }
    if (!evaluateOne(listing, def, filter)) {
      failedKeys.push(filter.key);
    }
  }
  return { matched: failedKeys.length === 0, failedKeys };
}
