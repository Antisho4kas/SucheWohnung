/**
 * Domain enums — aligned with sql/schema.sql DDL and §03 Functional Requirements.
 */

/** user_role ENUM (07-Database-Design §7.3) */
export const USER_ROLES = ["user", "premium", "admin", "super_admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** user_status ENUM */
export const USER_STATUSES = ["pending", "active", "suspended", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** integration_type ENUM */
export const INTEGRATION_TYPES = ["api", "scrape"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

/**
 * listing_status ENUM. `quarantine` (09 §9.8 Quality Gate) is carried as an
 * application-level status stored in attributes when DDL enum is unavailable;
 * canonical DDL statuses are active/updated/expired/removed.
 */
export const LISTING_STATUSES = ["active", "updated", "expired", "removed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Deal type (§03.2.1) */
export const DEAL_TYPES = ["rent", "buy"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

/** Price type (§03.2.1): Kaltmiete / Warmmiete / purchase */
export const PRICE_TYPES = ["cold", "warm", "purchase"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

/** The 16 German federal states (§03.2.1 — enum 16 земель). */
export const BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
] as const;
export type Bundesland = (typeof BUNDESLAENDER)[number];

/** Boolean attribute keys (§03.2.1 — stored under listings.attributes.*). */
export const BOOLEAN_ATTRIBUTES = [
  "balcony",
  "terrace",
  "elevator",
  "parking",
  "cellar",
  "furnished",
  "pets_allowed",
  "new_building",
  "provisionfrei",
] as const;
export type BooleanAttribute = (typeof BOOLEAN_ATTRIBUTES)[number];

/** Match state (§07 matches.state) */
export const MATCH_STATES = ["pending", "notified", "dismissed"] as const;
export type MatchState = (typeof MATCH_STATES)[number];

/** notification status (§07 notifications.status) */
export const NOTIFICATION_STATUSES = ["queued", "pending", "sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Circuit breaker states (§07 sources.breaker_state) */
export const BREAKER_STATES = ["closed", "open", "half_open"] as const;
export type BreakerState = (typeof BREAKER_STATES)[number];

/** Source run status (§07 source_runs.status) */
export const SOURCE_RUN_STATUSES = ["running", "success", "partial", "failed"] as const;
export type SourceRunStatus = (typeof SOURCE_RUN_STATUSES)[number];

/** Supported UI / notification locales (§04.10 i18n: DE/EN/RU). */
export const LOCALES = ["de", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

/** Germany bounding box for geo sanity checks (§09.8). */
export const GERMANY_BBOX = {
  minLat: 47.2,
  maxLat: 55.1,
  minLng: 5.8,
  maxLng: 15.1,
} as const;
