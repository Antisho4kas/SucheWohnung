import { loadHtml } from "./selector.js";

export type JsonLdValue =
  | JsonLdObject
  | JsonLdValue[]
  | string
  | number
  | boolean
  | null;
export interface JsonLdObject {
  readonly [key: string]: JsonLdValue | undefined;
}

export function extractJsonLd(html: string): JsonLdObject[] {
  const $ = loadHtml(html);
  const values: JsonLdObject[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;

    try {
      values.push(...flattenJsonLd(JSON.parse(raw) as JsonLdValue));
    } catch {
      // A page can contain unrelated malformed structured-data blocks; callers
      // should still receive the valid blocks from the same document.
    }
  });

  return values;
}

export function findJsonLdByType(html: string, type: string): JsonLdObject[] {
  return extractJsonLd(html).filter((value) => hasJsonLdType(value, type));
}

function flattenJsonLd(value: JsonLdValue): JsonLdObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isJsonLdObject(value)) return [];

  const graph = value["@graph"];
  if (Array.isArray(graph)) return graph.flatMap(flattenJsonLd);
  return [value];
}

function hasJsonLdType(value: JsonLdObject, type: string): boolean {
  const rawType = value["@type"];
  if (typeof rawType === "string") return rawType === type;
  return Array.isArray(rawType) && rawType.includes(type);
}

function isJsonLdObject(value: JsonLdValue): value is JsonLdObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
