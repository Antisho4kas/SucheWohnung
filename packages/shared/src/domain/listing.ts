import { z } from "zod";
import { BUNDESLAENDER, DEAL_TYPES, GERMANY_BBOX } from "./enums.js";

/**
 * Canonical NormalizedListing — the single internal model the core works with
 * (§01.4, §05.8, §09.2). Connectors map RawListing → NormalizedListing.
 * Quality Gate sanity rules from §9.8 are encoded here.
 */

export const GeoPointSchema = z.object({
  lat: z.number().min(GERMANY_BBOX.minLat).max(GERMANY_BBOX.maxLat),
  lng: z.number().min(GERMANY_BBOX.minLng).max(GERMANY_BBOX.maxLng),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const ListingImageSchema = z.object({
  url: z.string().url(),
  position: z.number().int().nonnegative().default(0),
});
export type ListingImage = z.infer<typeof ListingImageSchema>;

/** Boolean + extensible attributes bag (stored in listings.attributes JSONB). */
export const ListingAttributesSchema = z
  .object({
    balcony: z.boolean().optional(),
    terrace: z.boolean().optional(),
    elevator: z.boolean().optional(),
    parking: z.boolean().optional(),
    cellar: z.boolean().optional(),
    furnished: z.boolean().optional(),
    pets_allowed: z.boolean().optional(),
    new_building: z.boolean().optional(),
    provisionfrei: z.boolean().optional(),
  })
  .catchall(z.unknown());
export type ListingAttributes = z.infer<typeof ListingAttributesSchema>;

/**
 * Quality Gate sanity ranges (§9.8):
 * price ∈ [50, 50000], area ∈ [5, 1000], rooms ∈ [0.5, 20], PLZ = 5 digits.
 */
export const NormalizedListingSchema = z
  .object({
    sourceSlug: z.string().min(1),
    externalId: z.string().min(1),
    url: z.string().url(),
    title: z.string().min(1).max(500).optional(),
    dealType: z.enum(DEAL_TYPES).default("rent"),
    price: z.number().min(50).max(50000).optional(),
    warmRent: z.number().min(50).max(60000).optional(),
    area: z.number().min(5).max(1000).optional(),
    rooms: z.number().min(0.5).max(20).optional(),
    city: z.string().min(1).max(120).optional(),
    bundesland: z.enum(BUNDESLAENDER).optional(),
    postalCode: z
      .string()
      .regex(/^\d{5}$/u, "PLZ must be exactly 5 digits")
      .optional(),
    geo: GeoPointSchema.optional(),
    attributes: ListingAttributesSchema.default({}),
    images: z.array(ListingImageSchema).default([]),
    raw: z.unknown().optional(),
  })
  .refine((l) => l.price !== undefined || l.warmRent !== undefined, {
    message: "At least one of price or warmRent is required",
    path: ["price"],
  });

export type NormalizedListing = z.infer<typeof NormalizedListingSchema>;

/** RawListing — opaque source payload before mapping. */
export type RawListing = Record<string, unknown>;
