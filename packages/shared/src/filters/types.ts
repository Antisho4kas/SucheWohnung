import { z } from "zod";

/**
 * Schema-driven filters (§10.2, FR-FILT-3).
 * A filter is described declaratively in `filter_definitions`; the matching
 * engine is generic and applies operators based on `data_type`. Adding a new
 * filter = a new row in filter_definitions (+ optionally a new attribute),
 * with ZERO changes to matching code (§18.5 invariant).
 */

export const FILTER_DATA_TYPES = [
  "number",
  "bool",
  "enum",
  "text",
  "range",
  "geo",
] as const;
export type FilterDataType = (typeof FILTER_DATA_TYPES)[number];

export const FILTER_OPERATORS = ["gte", "lte", "eq", "in", "within"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Where the filter reads its value from on a normalized listing. */
export interface FilterFieldBinding {
  /** Top-level listing column, e.g. "price", "city", "geo". */
  readonly column?: string;
  /** Key inside attributes JSONB, e.g. "balcony". */
  readonly attribute?: string;
}

export interface FilterDefinition {
  readonly key: string;
  readonly label: Record<string, string>;
  readonly dataType: FilterDataType;
  readonly operatorSet: readonly FilterOperator[];
  readonly binding: FilterFieldBinding;
  readonly config?: Record<string, unknown>;
  readonly isActive?: boolean;
}

/** A single concrete filter on a profile (profile_filters row). */
export const ProfileFilterSchema = z.object({
  key: z.string().min(1),
  operator: z.enum(FILTER_OPERATORS),
  value: z.unknown(),
});
export type ProfileFilter = z.infer<typeof ProfileFilterSchema>;

/** Geo value for `within` operator. */
export const GeoWithinValueSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  radius_km: z.number().finite().positive(),
});
export type GeoWithinValue = z.infer<typeof GeoWithinValueSchema>;
