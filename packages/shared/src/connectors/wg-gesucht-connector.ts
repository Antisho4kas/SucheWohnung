import type {
  SourceConnector,
  FetchOptions,
  ConnectorContext,
  HealthStatus,
} from "./contract.js";
import type {
  ListingAttributes,
  NormalizedListing,
  RawListing,
} from "../domain/listing.js";
import { z } from "zod";
import {
  createConnectorRequestInit,
  createConnectorConfigSchema,
  parseConnectorConfig,
  resolveConnectorUrl,
} from "./config.js";
import {
  ConnectorAbortError,
  ConnectorConfigError,
  stringifyError,
} from "./errors.js";
import { extractJsonLd } from "./extractors/json-ld.js";

export const WG_GESUCHT_SOURCE_SLUG = "wg-gesucht";

type RentType = "wg_room" | "apartment" | "sublet" | "unknown";

interface AddressFields {
  readonly address?: string;
  readonly city?: string;
  readonly postalCode?: string;
}

interface RentalTypeFlags {
  readonly rentType: RentType;
  readonly isApartment: boolean;
  readonly isSublet: boolean;
  readonly isWg: boolean;
}

interface ListingCandidate {
  readonly listing: UnknownRecord;
  readonly listItem: UnknownRecord;
}

type UnknownRecord = Record<string, unknown>;

const publicPathSchema = z
  .string()
  .min(1)
  .refine((value) => !usesApiPath(value), {
    message: "WG-Gesucht connector must use public pages, not /api/ endpoints",
  });

const WgGesuchtConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default("https://www.wg-gesucht.de")
    .refine((url) => !usesApiPath(url), {
      message: "baseUrl must not point at a /api/ endpoint",
    })
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: publicPathSchema.default("/"),
  searchPath: publicPathSchema.default(
    "/wohnungen-in-Ingolstadt.65.2.1.0.html",
  ),
  searchPaths: z.array(publicPathSchema).min(1).optional(),
  city: z.string().min(1).default("Ingolstadt"),
  maxPages: z.number().int().min(1).max(50).default(1),
  pageDelayMs: z.number().int().min(0).max(60000).default(2000),
  pageParam: z.string().min(1).default("page"),
  userAgent: z.string().min(1).default("SucheWohnung/1.0"),
});

type WgGesuchtConfig = z.infer<typeof WgGesuchtConfigSchema>;

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

const parseConfig = (ctx: ConnectorContext): WgGesuchtConfig =>
  parseConnectorConfig(
    WgGesuchtConfigSchema,
    ctx.config,
    WG_GESUCHT_SOURCE_SLUG,
  );

const configErrorDetail = (error: unknown): string =>
  error instanceof ConnectorConfigError && error.issues
    ? error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
    : error instanceof z.ZodError
      ? error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      : String(error);

const isCancellationError = (error: unknown, signal: AbortSignal): boolean =>
  signal.aborted ||
  error instanceof ConnectorAbortError ||
  (error instanceof Error && error.name === "AbortError");

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ConnectorAbortError());
      return;
    }

    const cleanup = () => signal.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new ConnectorAbortError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });

export class WgGesuchtConnector implements SourceConnector {
  readonly slug = WG_GESUCHT_SOURCE_SLUG;
  readonly type = "scrape" as const;

  async healthCheck(ctx: ConnectorContext): Promise<HealthStatus> {
    try {
      const config = parseConfig(ctx);
      const res = await ctx.http.get(
        resolveConnectorUrl(config.baseUrl, config.healthPath),
        createConnectorRequestInit(config, ctx.signal),
      );
      return { healthy: isSuccessful(res.status) };
    } catch (error) {
      if (isCancellationError(error, ctx.signal)) throw error;
      return { healthy: false, detail: configErrorDetail(error) };
    }
  }

  async *fetch(
    ctx: ConnectorContext,
    opts: FetchOptions,
  ): AsyncIterable<RawListing> {
    let config: WgGesuchtConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(`WG-Gesucht config error: ${configErrorDetail(error)}`);
      return;
    }

    const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
    let yielded = 0;
    const searchPaths = config.searchPaths ?? [config.searchPath];

    for (const searchPath of searchPaths) {
      for (
        let page = 1;
        page <= config.maxPages && yielded < maxItems;
        page++
      ) {
        try {
          const searchUrl = buildSearchUrl(config, searchPath, page);
          const res = await ctx.http.get(
            searchUrl,
            createConnectorRequestInit(config, ctx.signal),
          );
          if (!isSuccessful(res.status)) break;

          const html = await res.text();
          const rawListings = parseWgGesuchtJsonLd(html, config);
          for (const raw of rawListings) {
            if (yielded >= maxItems) break;
            yield raw;
            yielded++;
          }

          if (config.pageDelayMs > 0 && yielded < maxItems) {
            await wait(config.pageDelayMs, ctx.signal);
          }
        } catch (error) {
          if (isCancellationError(error, ctx.signal)) throw error;
          ctx.logger.error(`WG-Gesucht page ${page}: ${stringifyError(error)}`);
        }
      }
    }
  }

  map(raw: RawListing): NormalizedListing {
    const title = readString(raw.title);
    const url = readString(raw.url) ?? "";
    const externalId = readString(raw.adid) ?? idFromUrl(url) ?? "";
    const description =
      readString(raw.fullDescription) ?? readString(raw.description);
    const price = normalizePrice(raw.price);
    const rooms = normalizeRooms(raw.rooms);
    const images = readStringArray(raw.images).map((imageUrl, position) => ({
      url: imageUrl,
      position,
    }));
    const flags = extractRentalTypeFlags(
      `${title ?? ""} ${description ?? ""} ${url}`,
    );
    const rentType = readRentType(raw.rentType) ?? flags.rentType;
    const attributes = buildAttributes(raw, description, rentType, flags);

    return {
      sourceSlug: this.slug,
      externalId,
      url,
      title,
      price,
      rooms,
      city: readString(raw.city),
      postalCode: readString(raw.postalCode),
      dealType: "rent",
      attributes,
      images,
      raw,
    };
  }
}

function buildSearchUrl(
  config: WgGesuchtConfig,
  searchPath: string,
  page: number,
): string {
  const path = searchPath.replace("{page}", String(page));
  const url = new URL(resolveConnectorUrl(config.baseUrl, path));
  if (page > 1 && !searchPath.includes("{page}")) {
    url.searchParams.set(config.pageParam, String(page));
  }
  return url.toString();
}

function parseWgGesuchtJsonLd(
  html: string,
  config: WgGesuchtConfig,
): RawListing[] {
  return extractJsonLd(html)
    .flatMap((value) => extractItemLists(value))
    .flatMap((itemList) => listItems(itemList["itemListElement"]))
    .flatMap((listItem) => {
      const candidate = listingCandidate(listItem);
      return candidate ? [candidate] : [];
    })
    .map((candidate) => rawListingFromCandidate(candidate, config))
    .filter((raw): raw is RawListing => raw !== undefined);
}

function rawListingFromCandidate(
  candidate: ListingCandidate,
  config: WgGesuchtConfig,
): RawListing | undefined {
  const { listing, listItem } = candidate;
  const mainEntity = isRecord(listing.mainEntity) ? listing.mainEntity : {};
  const url = absoluteUrl(
    readString(listing.url) ?? readString(listItem.url),
    config.baseUrl,
  );
  const adid = readIdentifier(listing.identifier) ?? idFromUrl(url);
  const title =
    readString(listing.name) ??
    readString(listing.headline) ??
    readString(listing.title) ??
    "";
  const description = readString(listing.description) ?? "";
  const price = extractPrice(listing, `${title} ${description}`);
  const flags = extractRentalTypeFlags(`${title} ${description} ${url ?? ""}`);
  const rooms = extractRooms(
    listing,
    `${title} ${description}`,
    flags.rentType,
  );
  const address = extractAddress(
    listing.address ?? mainEntity.address,
    description,
  );
  const images = extractImages(
    listing.image ?? mainEntity.image,
    config.baseUrl,
  );

  if (!adid || !url || price === undefined) return undefined;

  return {
    adid,
    url,
    title,
    price,
    rooms,
    city: address.city ?? config.city,
    postalCode: address.postalCode,
    address: address.address,
    images,
    fullDescription: description,
    details: {
      rentType: flags.rentType,
      address: address.address,
    },
    published_at: readString(listing.datePosted) ?? null,
    description,
    rentType: flags.rentType,
    isApartment: flags.isApartment,
    isSublet: flags.isSublet,
    isWg: flags.isWg,
    jsonLd: listing,
  };
}

function buildAttributes(
  raw: RawListing,
  description: string | undefined,
  rentType: RentType,
  flags: RentalTypeFlags,
): ListingAttributes {
  const text = description ?? "";
  return {
    ...(readBoolean(raw.isWg) || flags.isWg ? { wg: true } : {}),
    ...(readBoolean(raw.isApartment) || flags.isApartment
      ? { apartment: true }
      : {}),
    ...(readBoolean(raw.isSublet) || flags.isSublet ? { sublet: true } : {}),
    ...(rentType !== "unknown" ? { rent_type: rentType } : {}),
    ...(/balkon/i.test(text) ? { balcony: true } : {}),
    ...(/terrasse/i.test(text) ? { terrace: true } : {}),
    ...(/aufzug|lift|fahrstuhl/i.test(text) ? { elevator: true } : {}),
    ...(/stellplatz|garage|tiefgarage/i.test(text) ? { parking: true } : {}),
    ...(/möbliert|moebliert|einbauküche|einbaukueche|\bebk\b/i.test(text)
      ? { furnished: true }
      : {}),
  };
}

function extractItemLists(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.flatMap(extractItemLists);
  if (!isRecord(value)) return [];

  const nested = Object.values(value).flatMap(extractItemLists);
  return hasType(value, "ItemList") ? [value, ...nested] : nested;
}

function extractPrice(
  listing: UnknownRecord,
  fallbackText: string,
): number | undefined {
  const offers = listItems(listing.offers).filter(isRecord);
  const offerPriceSpecs = offers
    .flatMap((offer) => listItems(offer.priceSpecification))
    .filter(isRecord);
  const candidates = [
    listing.price,
    ...offers.flatMap((offer) => [offer.price, offer.lowPrice]),
    ...offerPriceSpecs.map((spec) => spec.price),
  ];

  return (
    candidates.map(normalizePrice).find((price) => price !== undefined) ??
    extractPriceFromText(fallbackText)
  );
}

function extractPriceFromText(text: string): number | undefined {
  const patterns = [
    /(?:warmmiete|kaltmiete|miete|warm|rent)[^\d]{0,24}(\d[\d.\s]*[,.]?\d*)\s*(?:€|eur)?/giu,
    /(\d[\d.\s]*[,.]?\d*)\s*(?:€|eur)\s*(?:warm|kalt|miete|warmmiete)?/giu,
  ];
  const prices = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].flatMap((match) => {
      const price = normalizePrice(match[1]);
      return price === undefined ? [] : [price];
    }),
  );
  return prices[0];
}

function extractRooms(
  listing: UnknownRecord,
  text: string,
  rentType: RentType,
): number | undefined {
  const structured = [
    listing.numberOfRooms,
    listing.rooms,
    listing.numberOfBedrooms,
  ]
    .map(normalizeRooms)
    .find((rooms) => rooms !== undefined);
  if (structured !== undefined) return structured;

  const match = text.match(
    /(\d+(?:[,.]\d+)?)\s*(?:zimmer(?:n)?|zi\.?|rooms?)\b/iu,
  );
  const parsed = normalizeRooms(match?.[1]);
  if (parsed !== undefined) return parsed;
  return rentType === "wg_room" ? 1 : undefined;
}

function extractAddress(value: unknown, fallbackText: string): AddressFields {
  if (isRecord(value)) {
    const street = readString(value.streetAddress);
    const postalCode =
      readString(value.postalCode) ?? extractPostalCode(fallbackText);
    const city = readString(value.addressLocality);
    const cityPart = [postalCode, city].filter(Boolean).join(" ");
    const address = [street, cityPart].filter(Boolean).join(", ");
    return {
      address: address || undefined,
      city,
      postalCode,
    };
  }

  const address = readString(value);
  const postalCode =
    extractPostalCode(address) ?? extractPostalCode(fallbackText);
  return {
    address,
    city: extractCity(address),
    postalCode,
  };
}

function extractImages(value: unknown, baseUrl: string): string[] {
  return listItems(value)
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!isRecord(item)) return [];
      const url = readString(item.url) ?? readString(item.contentUrl);
      return url ? [url] : [];
    })
    .flatMap((url) => {
      const resolved = absoluteUrl(url, baseUrl);
      return resolved ? [resolved] : [];
    });
}

function extractRentalTypeFlags(text: string): RentalTypeFlags {
  const isSublet = /zwischenmiete|untermiete|befristet|sublet/i.test(text);
  const isWg =
    /wg-zimmer|wohngemeinschaft|zimmer\s+in\s+(?:einer\s+)?wg/i.test(text) ||
    /\bwg\b(?!-gesucht)/i.test(text);
  const isApartment = /wohnung|wohnungen|apartment|appartement/i.test(text);
  const rentType: RentType = isSublet
    ? "sublet"
    : isWg
      ? "wg_room"
      : isApartment
        ? "apartment"
        : "unknown";
  return { rentType, isApartment, isSublet, isWg };
}

function listingCandidate(value: unknown): ListingCandidate | undefined {
  if (!isRecord(value)) return undefined;
  if (hasType(value, "RealEstateListing")) {
    return { listing: value, listItem: {} };
  }

  const item = value.item;
  if (isRecord(item) && hasType(item, "RealEstateListing")) {
    return { listing: item, listItem: value };
  }
  return undefined;
}

function hasType(value: UnknownRecord, type: string): boolean {
  const rawType = value["@type"];
  return typeof rawType === "string"
    ? rawType === type
    : Array.isArray(rawType) && rawType.includes(type);
}

function listItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function readIdentifier(value: unknown): string | undefined {
  if (isRecord(value)) return readString(value.value) ?? readString(value.name);
  return readString(value);
}

function readRentType(value: unknown): RentType | undefined {
  return value === "wg_room" ||
    value === "apartment" ||
    value === "sublet" ||
    value === "unknown"
    ? value
    : undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized || undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = readString(item);
        return text ? [text] : [];
      })
    : [];
}

function normalizePrice(value: unknown): number | undefined {
  const parsed = parseGermanNumber(value);
  return parsed !== undefined && parsed >= 50 && parsed <= 50000
    ? parsed
    : undefined;
}

function normalizeRooms(value: unknown): number | undefined {
  const parsed = parseGermanNumber(value);
  return parsed !== undefined && parsed >= 0.5 && parsed <= 20
    ? parsed
    : undefined;
}

function parseGermanNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const cleaned = value.replace(/[^\d,.-]/gu, "");
  if (!/\d/u.test(cleaned)) return undefined;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./gu, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/u.test(cleaned)
      ? cleaned.replace(/\./gu, "")
      : cleaned;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function absoluteUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(
      value.startsWith("//") ? `https:${value}` : value,
      baseUrl,
    ).toString();
  } catch {
    return undefined;
  }
}

function idFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = value.match(/\.([0-9]+)\.html(?:[?#].*)?$/u)?.[1];
  if (parsed) return parsed;

  const numericPage = value.match(/\/([0-9]+)\.html(?:[?#].*)?$/u)?.[1];
  if (numericPage) return numericPage;

  try {
    const lastSegment = new URL(value).pathname
      .split("/")
      .filter(Boolean)
      .at(-1);
    return lastSegment?.replace(/\.html$/iu, "");
  } catch {
    return undefined;
  }
}

function extractPostalCode(value: string | undefined): string | undefined {
  return value?.match(/\b\d{5}\b/u)?.[0];
}

function extractCity(value: string | undefined): string | undefined {
  return value?.match(/\b\d{5}\s+([^,]+)/u)?.[1]?.trim();
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usesApiPath(value: string): boolean {
  try {
    const url = new URL(value, "https://wg-gesucht.invalid");
    return /(^|\/)api(?:\/|$)/iu.test(url.pathname);
  } catch {
    return /(^|\/)api(?:\/|$)/iu.test(value);
  }
}
