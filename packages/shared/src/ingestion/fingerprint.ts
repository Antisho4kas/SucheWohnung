import { createHash } from "node:crypto";
import type { NormalizedListing } from "../domain/listing.js";

/**
 * Deduplication fingerprint (§7.5).
 *
 *   fingerprint = sha256( normalize(
 *       source_slug + '|' +
 *       coalesce(external_id, street+postal+area+rooms+price)
 *   ))
 *
 * If the source has a stable external_id → use it (plus source slug).
 * Otherwise fall back to a content-based key.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function computeFingerprint(listing: NormalizedListing): string {
  const hasExternal = listing.externalId && listing.externalId.trim().length > 0;
  const basis = hasExternal
    ? `${listing.sourceSlug}|${listing.externalId}`
    : [
        listing.sourceSlug,
        listing.postalCode ?? "",
        listing.area ?? "",
        listing.rooms ?? "",
        listing.price ?? listing.warmRent ?? "",
        listing.title ?? "",
      ].join("|");
  return createHash("sha256").update(normalize(basis)).digest("hex");
}

/**
 * Soft (cross-source) fingerprint (§7.5) — normalized
 * postal_code + area(±2 m²) + rooms + price(±50€) bucket.
 * Used for cross-portal dedup grouping (Stage 3).
 */
export function computeSoftFingerprint(listing: NormalizedListing): string {
  const priceBucket =
    listing.price !== undefined ? Math.round(listing.price / 50) * 50 : "";
  const areaBucket =
    listing.area !== undefined ? Math.round(listing.area / 2) * 2 : "";
  const basis = [
    listing.postalCode ?? "",
    areaBucket,
    listing.rooms ?? "",
    priceBucket,
  ].join("|");
  return createHash("sha256").update(normalize(basis)).digest("hex");
}
