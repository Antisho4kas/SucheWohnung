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
});
