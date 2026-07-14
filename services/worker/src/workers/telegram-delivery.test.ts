import { describe, expect, it } from "vitest";
import {
  buildListingReplyMarkup,
  renderTelegramNotification,
} from "./telegram-delivery.js";

const listing = {
  id: "listing-1",
  url: "https://www.kleinanzeigen.de/s-anzeige/x/123",
  city: "Ingolstadt",
  price: 750,
  area: 55,
  rooms: 2,
  source: { name: "Kleinanzeigen" },
  images: [],
};

describe("buildListingReplyMarkup", () => {
  it("offers a single open-listing URL button", () => {
    const markup = buildListingReplyMarkup({ listingUrl: listing.url });
    expect(markup?.inline_keyboard).toEqual([
      [{ text: "🔗 Открыть и написать", url: listing.url }]],
    );
  });

  it("returns undefined when the URL is invalid", () => {
    expect(buildListingReplyMarkup({ listingUrl: "not-a-url" })).toBeUndefined();
  });
});

describe("renderTelegramNotification reply block", () => {
  it("omits the reply block when no reply text is set", () => {
    const text = renderTelegramNotification(listing);
    expect(text).not.toContain("<pre>");
    expect(text).not.toContain("Готовый текст");
  });

  it("embeds the full reply as a copyable <pre> block (no 256-char cap)", () => {
    const reply =
      "Guten Tag,\nmein Name ist Taras. " + "Sehr lange Nachricht ".repeat(30);
    const text = renderTelegramNotification(listing, reply);
    expect(text).toContain("<pre>");
    // Full text preserved — not truncated to 256 chars.
    expect(text.length).toBeGreaterThan(400);
    expect(text).toContain("Готовый текст ответа");
  });

  it("HTML-escapes the reply so markup can't break the message", () => {
    const text = renderTelegramNotification(listing, "A & B <tag> \"q\"");
    expect(text).toContain("A &amp; B &lt;tag&gt; &quot;q&quot;");
    expect(text).not.toContain("<tag>");
  });

  it("ignores whitespace-only reply text", () => {
    const text = renderTelegramNotification(listing, "   ");
    expect(text).not.toContain("<pre>");
  });
});
