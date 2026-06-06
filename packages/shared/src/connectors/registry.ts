import { ConnectorRegistry } from "./contract.js";
import {
  IMMOSCOUT_SOURCE_SLUG,
  ImmoscoutConnector,
} from "./immoscout-connector.js";
import {
  IMMOWELT_SOURCE_SLUG,
  ImmoweltConnector,
} from "./immowelt-connector.js";
import {
  KLEINANZEIGEN_SOURCE_SLUG,
  KleinanzeigenConnector,
} from "./kleinanzeigen-connector.js";
import {
  LEG_WOHNEN_SOURCE_SLUG,
  LegWohnenConnector,
} from "./leg-wohnen-connector.js";
import { MOCK_SOURCE_SLUG, MockConnector } from "./mock-connector.js";

export const DEFAULT_CONNECTOR_REGISTRY_SLUGS = [
  MOCK_SOURCE_SLUG,
  KLEINANZEIGEN_SOURCE_SLUG,
  IMMOWELT_SOURCE_SLUG,
  IMMOSCOUT_SOURCE_SLUG,
  LEG_WOHNEN_SOURCE_SLUG,
] as const;

const DEFAULT_CONNECTOR_REGISTRY_SLUG_SET = new Set<string>(
  DEFAULT_CONNECTOR_REGISTRY_SLUGS,
);

export function isDefaultConnectorRegistered(slug: string): boolean {
  return DEFAULT_CONNECTOR_REGISTRY_SLUG_SET.has(slug);
}

export function createDefaultConnectorRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  registry.register(new MockConnector());
  registry.register(new KleinanzeigenConnector());
  registry.register(new ImmoweltConnector());
  registry.register(new ImmoscoutConnector());
  registry.register(new LegWohnenConnector());
  return registry;
}
