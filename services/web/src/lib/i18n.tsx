"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { dict, type DictKey } from "./dict";

export type Locale = "de" | "ru";

const STORAGE_KEY = "suchewohnung_locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: DictKey, replacements?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "de";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "ru") return stored;
  } catch {
    // localStorage unavailable
  }
  return "de";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== locale) {
      setLocaleState(stored);
    }
  // eslint-disable-next-line
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: DictKey, replacements?: Record<string, string>) => {
      const text = dict[locale]?.[key] ?? dict.de[key] ?? key;
      if (!replacements) return text;
      return Object.entries(replacements).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, v),
        text,
      );
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

/**
 * Server-safe translation function for RSCs. Pass the locale explicitly.
 */
export function translate(
  locale: Locale,
  key: DictKey,
  replacements?: Record<string, string>,
): string {
  const text = dict[locale]?.[key] ?? dict.de[key] ?? key;
  if (!replacements) return text;
  return Object.entries(replacements).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, v),
    text,
  );
}
