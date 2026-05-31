import {
  NormalizedListingSchema,
  type NormalizedListing,
} from "../domain/listing.js";

/**
 * Quality Gate (§9.8). Validates a normalized listing via Zod (types,
 * required fields, sanity ranges, PLZ, geo bounds). Listings that fail are
 * quarantined (not dropped silently) so broken selectors are visible (§9.8).
 */
export interface QualityResult {
  readonly ok: boolean;
  readonly listing?: NormalizedListing;
  readonly issues: string[];
}

export function runQualityGate(raw: unknown): QualityResult {
  const parsed = NormalizedListingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }
  return { ok: true, listing: parsed.data, issues: [] };
}
