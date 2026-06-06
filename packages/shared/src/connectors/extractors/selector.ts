import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { ConnectorExtractionError } from "../errors.js";

export interface SelectorExtractionOptions {
  readonly required?: boolean;
  readonly normalizeWhitespace?: boolean;
}

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

export function normalizeText(
  value: string,
  normalizeWhitespace = true,
): string {
  const trimmed = value.trim();
  return normalizeWhitespace ? trimmed.replace(/\s+/gu, " ") : trimmed;
}

export function extractText(
  html: string | CheerioAPI,
  selector: string,
  options: SelectorExtractionOptions = {},
): string | undefined {
  const $ = typeof html === "string" ? loadHtml(html) : html;
  const value = normalizeText(
    $(selector).first().text(),
    options.normalizeWhitespace ?? true,
  );
  return requireValue(value || undefined, selector, options.required, "text");
}

export function extractAttribute(
  html: string | CheerioAPI,
  selector: string,
  attribute: string,
  options: SelectorExtractionOptions = {},
): string | undefined {
  const $ = typeof html === "string" ? loadHtml(html) : html;
  const value = $(selector).first().attr(attribute);
  const normalized = value
    ? normalizeText(value, options.normalizeWhitespace ?? true)
    : undefined;
  return requireValue(
    normalized || undefined,
    selector,
    options.required,
    `attribute ${attribute}`,
  );
}

export function extractTextList(
  html: string | CheerioAPI,
  selector: string,
  options: SelectorExtractionOptions = {},
): string[] {
  const $ = typeof html === "string" ? loadHtml(html) : html;
  const values: string[] = [];
  $(selector).each((_index, element) => {
    const value = normalizeText(
      $(element).text(),
      options.normalizeWhitespace ?? true,
    );
    if (value) values.push(value);
  });

  if (options.required && values.length === 0) {
    throw new ConnectorExtractionError(
      `Required selector not found: ${selector}`,
      selector,
    );
  }

  return values;
}

function requireValue(
  value: string | undefined,
  selector: string,
  required: boolean | undefined,
  label: string,
): string | undefined {
  if (value !== undefined) return value;
  if (required)
    throw new ConnectorExtractionError(
      `Required ${label} not found: ${selector}`,
      selector,
    );
  return undefined;
}
