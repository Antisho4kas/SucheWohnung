import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfileForm } from "./ProfileForm";
import { normalizeFilterDefinition } from "../lib/api";

vi.mock("../lib/i18n", () => ({
  useLocale: () => ({
    locale: "de",
    t: (key: string) => key,
  }),
}));

describe("ProfileForm", () => {
  it("renders fields from backend filter definitions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileForm, {
        filterDefinitions: [
          normalizeFilterDefinition({
            key: "price",
            label: { de: "Preis" },
            dataType: "number",
            operatorSet: ["gte", "lte"],
          }),
          normalizeFilterDefinition({
            key: "pets_allowed",
            label: { de: "Haustiere erlaubt" },
            dataType: "bool",
            operatorSet: ["eq"],
          }),
          normalizeFilterDefinition({
            key: "provisionfrei",
            label: { de: "Provisionsfrei" },
            dataType: "bool",
            operatorSet: ["eq"],
          }),
        ],
        onSubmit: vi.fn(),
      }),
    );

    expect(html).toContain("Preis");
    expect(html).toContain("Haustiere erlaubt");
    expect(html).toContain("Provisionsfrei");
    expect(html).not.toContain("profile.balcony");
  });

  it("renders the geo center and PLZ auto-city hint from a postal code", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileForm, {
        filterDefinitions: [
          normalizeFilterDefinition({
            key: "postal_code",
            label: { de: "PLZ" },
            dataType: "text",
            operatorSet: ["eq"],
          }),
          normalizeFilterDefinition({
            key: "geo",
            label: { de: "Umkreis" },
            dataType: "geo",
            operatorSet: ["within"],
          }),
          normalizeFilterDefinition({
            key: "price",
            label: { de: "Preis" },
            dataType: "number",
            operatorSet: ["gte", "lte", "eq"],
          }),
        ],
        // Ingolstadt PLZ + centroid coords, no explicit city -> triggers both
        // the "auto-city" button and the "geo center" hint render branches.
        initialValues: {
          postal_code: "85049",
          lat: 48.7665,
          lng: 11.4258,
          radius_km: 10,
          price_min: 400,
          price_max: 1200,
        },
        onSubmit: vi.fn(),
      }),
    );

    // Geo center + auto-city both resolve to the Ingolstadt PLZ.
    expect(html).toContain("Ingolstadt");
    expect(html).toContain("profile.geoCenter");
    expect(html).toContain("profile.autoCity");
    // Numeric min/max inputs are rendered with their initial values.
    expect(html).toContain("400");
    expect(html).toContain("1200");
  });

  it("keeps the auto-city hint hidden when a city is already set", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileForm, {
        filterDefinitions: [
          normalizeFilterDefinition({
            key: "postal_code",
            label: { de: "PLZ" },
            dataType: "text",
            operatorSet: ["eq"],
          }),
          normalizeFilterDefinition({
            key: "city",
            label: { de: "Stadt" },
            dataType: "text",
            operatorSet: ["eq"],
          }),
        ],
        initialValues: { postal_code: "85049", city: "Ingolstadt" },
        onSubmit: vi.fn(),
      }),
    );

    expect(html).not.toContain("profile.autoCity");
  });
});
