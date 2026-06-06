import { describe, expect, it } from "vitest";
import { ConnectorExtractionError } from "../errors.js";
import {
  extractAttribute,
  extractText,
  extractTextList,
} from "../extractors/selector.js";
import { extractJsonLd, findJsonLdByType } from "../extractors/json-ld.js";

describe("connector extraction helpers", () => {
  it("extracts and normalizes selector text", () => {
    const html = `<article><h1>  Nice\n   flat   in Berlin </h1></article>`;

    expect(extractText(html, "h1")).toBe("Nice flat in Berlin");
  });

  it("extracts selector attributes", () => {
    const html = `<a class="detail" href="/listing/1">Open</a>`;

    expect(extractAttribute(html, "a.detail", "href")).toBe("/listing/1");
  });

  it("extracts lists of normalized text values", () => {
    const html = `<ul><li> Balcony </li><li>\nElevator</li><li> </li></ul>`;

    expect(extractTextList(html, "li")).toEqual(["Balcony", "Elevator"]);
  });

  it("throws extraction errors for missing required selectors", () => {
    expect(() =>
      extractText("<main></main>", ".missing", { required: true }),
    ).toThrow(ConnectorExtractionError);
  });

  it("extracts JSON-LD objects, arrays, and graph entries while skipping malformed scripts", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Apartment","name":"One"}</script>
      <script type="application/ld+json">[{"@type":"Offer","price":1200}]</script>
      <script type="application/ld+json">{"@graph":[{"@type":"Place","name":"Berlin"}]}</script>
      <script type="application/ld+json">{broken}</script>
    `;

    const values = extractJsonLd(html);

    expect(values).toHaveLength(3);
    expect(findJsonLdByType(html, "Apartment")).toEqual([
      { "@type": "Apartment", name: "One" },
    ]);
  });
});
