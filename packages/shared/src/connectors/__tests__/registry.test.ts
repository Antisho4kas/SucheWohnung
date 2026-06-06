import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONNECTOR_REGISTRY_SLUGS,
  createDefaultConnectorRegistry,
  getSourceActivationDecision,
} from "../index";

describe("default connector registry", () => {
  it("registers exactly the runtime-supported default source slugs", () => {
    const registry = createDefaultConnectorRegistry();

    expect(registry.list().map((connector) => connector.slug)).toEqual(
      DEFAULT_CONNECTOR_REGISTRY_SLUGS,
    );
  });

  it("requires both a registered connector and beta/ready approval", () => {
    expect(
      getSourceActivationDecision({
        sourceSlug: "mock",
        config: { lifecycleStatus: "ready", activationApproved: true },
        isRegistered: true,
      }).activatable,
    ).toBe(true);
    expect(
      getSourceActivationDecision({
        sourceSlug: "unregistered",
        config: { lifecycleStatus: "ready", activationApproved: true },
        isRegistered: false,
      }).activatable,
    ).toBe(false);
    expect(
      getSourceActivationDecision({
        sourceSlug: "mock",
        config: { lifecycleStatus: "blocked", activationApproved: true },
        isRegistered: true,
      }).activatable,
    ).toBe(false);
  });
});
