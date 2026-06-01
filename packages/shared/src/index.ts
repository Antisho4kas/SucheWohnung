// Domain
export * from "./domain/enums.js";
export * from "./domain/listing.js";

// Filters (schema-driven)
export * from "./filters/types.js";
export * from "./filters/registry.js";

// Matching engine
export * from "./matching/geo.js";
export * from "./matching/predicate-engine.js";
export * from "./matching/criteria.js";

// Ingestion
export * from "./ingestion/fingerprint.js";
export * from "./ingestion/quality-gate.js";

// Connectors
export * from "./connectors/contract.js";
export * from "./connectors/mock-connector.js";
export { KleinanzeigenConnector, KLEINANZEIGEN_SOURCE_SLUG } from "./connectors/kleinanzeigen-connector.js";
export { ImmoweltConnector, IMMOWELT_SOURCE_SLUG } from "./connectors/immowelt-connector.js";
export { ImmoscoutConnector, IMMOSCOUT_SOURCE_SLUG } from "./connectors/immoscout-connector.js";
