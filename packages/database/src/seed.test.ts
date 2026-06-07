import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONNECTOR_REGISTRY_SLUGS,
  getSourceActivationDecision,
  getSourceLifecycleConfig,
} from "@suchewohnung/shared";
import { SEED_SOURCES } from "./seed";

describe("source seed/runtime registry consistency", () => {
  it("declares lifecycle metadata for every seeded source", () => {
    expect(SEED_SOURCES.length).toBeGreaterThan(0);

    for (const source of SEED_SOURCES) {
      const lifecycle = getSourceLifecycleConfig(source.config);
      expect(lifecycle.lifecycleStatus).toBeDefined();
      expect(typeof lifecycle.activationApproved).toBe("boolean");
    }
  });

  it("does not seed an activatable source without a default runtime connector", () => {
    const registered = new Set<string>(DEFAULT_CONNECTOR_REGISTRY_SLUGS);
    const unregisteredActivatable = SEED_SOURCES.filter((source) => {
      const decision = getSourceActivationDecision({
        sourceSlug: source.slug,
        config: source.config,
        isRegistered: true,
      });
      return decision.activatable && !registered.has(source.slug);
    }).map((source) => source.slug);

    expect(unregisteredActivatable).toEqual([]);
  });

  it("keeps only runtime-registered and activation-approved sources active by default", () => {
    const registered = new Set<string>(DEFAULT_CONNECTOR_REGISTRY_SLUGS);
    const activeSources = SEED_SOURCES.filter((source) => source.isActive);

    // Operator-approved primary beta sources active by default.
    expect(activeSources.map((source) => source.slug).sort()).toEqual(
      ["kleinanzeigen", "leg-wohnen", "mock"],
    );
    for (const source of activeSources) {
      const decision = getSourceActivationDecision({
        sourceSlug: source.slug,
        config: source.config,
        isRegistered: registered.has(source.slug),
      });
      expect(decision.activatable).toBe(true);
    }
  });
});
