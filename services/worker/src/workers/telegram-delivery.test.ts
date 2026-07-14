import { describe, expect, it } from "vitest";
import { buildListingReplyMarkup } from "./telegram-delivery.js";

describe("buildListingReplyMarkup", () => {
  const url = "https://www.kleinanzeigen.de/s-anzeige/x/123";

  it("always includes an open-listing URL button", () => {
    const markup = buildListingReplyMarkup({ listingUrl: url });
    expect(markup?.inline_keyboard[0]?.[0]).toEqual({
      text: "🔗 Открыть и написать",
      url,
    });
  });

  it("adds a copy_text button when reply text is provided", () => {
    const markup = buildListingReplyMarkup({
      listingUrl: url,
      replyText: "Hallo, ist die Wohnung noch verfügbar?",
    });
    const buttons = markup?.inline_keyboard.flat() ?? [];
    expect(buttons).toContainEqual({
      text: "📋 Скопировать текст",
      copy_text: { text: "Hallo, ist die Wohnung noch verfügbar?" },
    });
  });

  it("omits the copy button when reply text is empty or whitespace", () => {
    for (const replyText of [undefined, null, "", "   "]) {
      const markup = buildListingReplyMarkup({ listingUrl: url, replyText });
      const hasCopy = (markup?.inline_keyboard.flat() ?? []).some(
        (b) => "copy_text" in b,
      );
      expect(hasCopy).toBe(false);
    }
  });

  it("clamps copy text to the 256-char Telegram limit", () => {
    const long = "a".repeat(400);
    const markup = buildListingReplyMarkup({ listingUrl: url, replyText: long });
    const copy = (markup?.inline_keyboard.flat() ?? []).find(
      (b) => "copy_text" in b,
    ) as { copy_text: { text: string } } | undefined;
    expect(copy?.copy_text.text).toHaveLength(256);
  });

  it("returns undefined when the URL is invalid and no reply text is set", () => {
    expect(
      buildListingReplyMarkup({ listingUrl: "not-a-url" }),
    ).toBeUndefined();
  });

  it("still offers the copy button when only the URL is invalid", () => {
    const markup = buildListingReplyMarkup({
      listingUrl: "not-a-url",
      replyText: "Guten Tag",
    });
    const buttons = markup?.inline_keyboard.flat() ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveProperty("copy_text");
  });
});
