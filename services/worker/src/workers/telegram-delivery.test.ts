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

describe("renderTelegramNotification", () => {
  it("renders listing fields with a link and no embedded reply block", () => {
    const text = renderTelegramNotification(listing);
    expect(text).toContain("Ingolstadt");
    expect(text).toContain("Ссылка на объявление");
    expect(text).not.toContain("<pre>");
    expect(text).not.toContain("Готовый текст");
  });

  it("escapes HTML in listing fields", () => {
    const text = renderTelegramNotification({
      ...listing,
      city: "Ingolstadt <b>",
      source: { name: "A & B" },
    });
    expect(text).toContain("Ingolstadt &lt;b&gt;");
    expect(text).toContain("A &amp; B");
  });
});
