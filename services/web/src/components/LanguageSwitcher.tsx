"use client";

import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const FLAGS: Record<Locale, string> = {
  de: "🇩🇪",
  ru: "🇷🇺",
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1 bg-muted rounded-full p-1">
      {(["de", "ru"] as Locale[]).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`px-3 py-1.5 rounded-full text-base font-semibold transition-all ${
            locale === l
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-card"
          }`}
          aria-label={`Switch to ${l === "de" ? "German" : "Russian"}`}
        >
          {FLAGS[l]}{" "}
          <span className="hidden sm:inline">{l.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
