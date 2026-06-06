import type {
  ConnectorContext,
  FetchOptions,
  HealthStatus,
  SourceConnector,
} from "./contract.js";
import type {
  ListingAttributes,
  NormalizedListing,
  RawListing,
} from "../domain/listing.js";
import { z } from "zod";
import type { CheerioAPI } from "cheerio";
import {
  createConnectorConfigSchema,
  createConnectorRequestInit,
  parseConnectorConfig,
  resolveConnectorUrl,
} from "./config.js";
import {
  ConnectorAbortError,
  ConnectorConfigError,
  stringifyError,
} from "./errors.js";
import { loadHtml, normalizeText } from "./extractors/selector.js";

export const WOHNUNGSBOERSE_SOURCE_SLUG = "wohnungsboerse";

const WOHNUNGSBOERSE_BASE_URL = "https://www.wohnungsboerse.net";

type UnknownRecord = Record<string, unknown>;
type CheerioSelection = ReturnType<CheerioAPI>;

const publicHtmlPathSchema = z
  .string()
  .min(1)
  .regex(/^\/(?!\/)/u, {
    message: "Path must be a relative public path like /searches/index",
  })
  .refine((value) => !usesDisallowedAjaxOrRssPath(value), {
    message: "Wohnungsboerse connector must use public HTML pages, not ajax/rss endpoints",
  });

const WohnungsboerseConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default(WOHNUNGSBOERSE_BASE_URL)
    .refine(isWohnungsboerseBaseUrl, {
      message:
        "baseUrl must use https://www.wohnungsboerse.net or https://wohnungsboerse.net",
    })
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: publicHtmlPathSchema.default("/"),
  searchPath: publicHtmlPathSchema.default("/searches/index"),
  city: z.string().min(1).default("Berlin"),
  minPrice: z.number().int().min(0).max(50000).optional(),
  maxPrice: z.number().int().min(50).max(50000).optional(),
  minRooms: z.number().min(0.5).max(20).optional(),
  maxRooms: z.number().min(0.5).max(20).optional(),
  maxPages: z.number().int().min(1).max(50).default(1),
  pageDelayMs: z.number().int().min(0).max(60000).default(2000),
  userAgent: z.string().min(1).default("SucheWohnung/1.0"),
})
  .refine(
    (config) =>
      config.minPrice === undefined ||
      config.maxPrice === undefined ||
      config.minPrice <= config.maxPrice,
    { path: ["minPrice"], message: "minPrice must be <= maxPrice" },
  )
  .refine(
    (config) =>
      config.minRooms === undefined ||
      config.maxRooms === undefined ||
      config.minRooms <= config.maxRooms,
    { path: ["minRooms"], message: "minRooms must be <= maxRooms" },
  );

type WohnungsboerseConfig = z.infer<typeof WohnungsboerseConfigSchema>;

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

const parseConfig = (ctx: ConnectorContext): WohnungsboerseConfig =>
  parseConnectorConfig(
    WohnungsboerseConfigSchema,
    ctx.config,
    WOHNUNGSBOERSE_SOURCE_SLUG,
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

export class WohnungsboerseConnector implements SourceConnector {
  readonly slug = WOHNUNGSBOERSE_SOURCE_SLUG;
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
    let config: WohnungsboerseConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(
        `Wohnungsboerse config error: ${configErrorDetail(error)}`,
      );
      return;
    }

    const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
    let yielded = 0;

    for (let page = 1; page <= config.maxPages && yielded < maxItems; page++) {
      try {
        const searchUrl = buildSearchUrl(config, page);
        const res = await ctx.http.get(
          searchUrl,
          createConnectorRequestInit(config, ctx.signal),
        );
        if (!isSuccessful(res.status)) break;

        const html = await res.text();
        const rawListings = parseSearchHtml(html, config);
        if (rawListings.length === 0) break;

        for (const raw of rawListings) {
          if (yielded >= maxItems) break;
          yield await enrichWithDetailPage(ctx, config, raw);
          yielded++;
        }

        if (
          config.pageDelayMs > 0 &&
          page < config.maxPages &&
          yielded < maxItems
        ) {
          await wait(config.pageDelayMs, ctx.signal);
        }
      } catch (error) {
        if (isCancellationError(error, ctx.signal)) throw error;
        ctx.logger.error(
          `Wohnungsboerse page ${page}: ${stringifyError(error)}`,
        );
      }
    }
  }

  map(raw: RawListing): NormalizedListing {
    const url = canonicalDetailUrl(readString(raw.url)) ?? "";
    const externalId = readString(raw.adid) ?? idFromDetailUrl(url) ?? "";
    const title = readString(raw.title);
    const description =
      readString(raw.fullDescription) ?? readString(raw.description);
    const price = normalizePrice(raw.price);
    const warmRent = normalizePrice(raw.warmRent);
    const images = readStringArray(raw.images).map((imageUrl, position) => ({
      url: imageUrl,
      position,
    }));

    return {
      sourceSlug: this.slug,
      externalId,
      url,
      title,
      price,
      warmRent,
      area: normalizeArea(raw.area),
      rooms: normalizeRooms(raw.rooms),
      city: readString(raw.city),
      postalCode: readString(raw.postalCode),
      dealType: "rent",
      attributes: buildAttributes(raw, description),
      images,
      raw,
    };
  }
}

function buildSearchUrl(config: WohnungsboerseConfig, page: number): string {
  const url = new URL(resolveConnectorUrl(config.baseUrl, config.searchPath));
  url.searchParams.set("marketing_type", "miete");
  url.searchParams.set("estate_types[0]", "1");
  url.searchParams.set("term", config.city);
  url.searchParams.set("page", String(page));
  if (config.minPrice !== undefined) {
    url.searchParams.set("minprice", String(config.minPrice));
  }
  if (config.maxPrice !== undefined) {
    url.searchParams.set("maxprice", String(config.maxPrice));
  }
  if (config.minRooms !== undefined) {
    url.searchParams.set("minrooms", String(config.minRooms));
  }
  if (config.maxRooms !== undefined) {
    url.searchParams.set("maxrooms", String(config.maxRooms));
  }
  return url.toString();
}

function parseSearchHtml(
  html: string,
  config: WohnungsboerseConfig,
): RawListing[] {
  const $ = loadHtml(html);
  const listings: RawListing[] = [];

  $("#ajax-estate-list .search_result_container > a[href*='/immodetail/'][class*='estate_'], .estate-list a[href*='/immodetail/']").each(
    (_index, element) => {
      const card = $(element);
      const href = readString(card.attr("href"));
      const url = canonicalDetailUrl(href, config.baseUrl);
      const adid = idFromDetailUrl(url) ?? idFromCardClass(card.attr("class"));
      const title = readString(card.find("h3").first().text()) ?? "";
      const description = readString(card.attr("title")) ?? "";
      const location = readString(
        card
          .find("h3")
          .first()
          .nextAll("div.text-caption")
          .first()
          .text(),
      );
      const { city, district } = splitLocation(location, config.city);
      const facts = extractFacts($, element);
      const images = card
        .find('img[src*="/assets/estates/"], img[src]')
        .toArray()
        .flatMap((image) => {
          const src = readString($(image).attr("src"));
          const resolved = safeWohnungsboerseImageUrl(src, config.baseUrl);
          return resolved ? [resolved] : [];
        });
      const badges = card
        .find('span[class*="icon-check_circle"], div.hidden.mt-1 span')
        .toArray()
        .flatMap((badge) => {
          const text = readString($(badge).text());
          return text ? [text] : [];
        });

      if (!adid || !url || !title || facts.price === undefined) return;

      listings.push({
        adid,
        url,
        title,
        price: facts.rentLabel === "Warmmiete" ? undefined : facts.price,
        warmRent: facts.rentLabel === "Warmmiete" ? facts.price : undefined,
        area: facts.area,
        rooms: facts.rooms,
        city,
        images,
        fullDescription: description,
        postalCode: undefined,
        details: {
          district,
          rentLabel: facts.rentLabel,
          badges,
        },
        published_at: null,
        description,
        badges,
      });
    },
  );

  return listings;
}

async function enrichWithDetailPage(
  ctx: ConnectorContext,
  config: WohnungsboerseConfig,
  raw: RawListing,
): Promise<RawListing> {
  const url = canonicalDetailUrl(readString(raw.url), config.baseUrl);
  if (!url) return raw;

  try {
    const res = await ctx.http.get(
      url,
      createConnectorRequestInit(config, ctx.signal),
    );
    if (!isSuccessful(res.status)) return raw;

    return mergeRawListings(raw, parseDetailHtml(await res.text(), config, raw));
  } catch (error) {
    if (isCancellationError(error, ctx.signal)) throw error;
    ctx.logger.warn(
      `Wohnungsboerse detail ${url}: ${stringifyError(error)}`,
    );
    return raw;
  }
}

function parseDetailHtml(
  html: string,
  config: WohnungsboerseConfig,
  raw: RawListing,
): RawListing {
  const $ = loadHtml(html);
  const detailRoot = $('[itemscope][itemtype*="schema.org/Apartment"]').first();
  const canonicalUrl = canonicalDetailUrl(
    readString($('link[rel="canonical"]').attr("href")) ??
      readString($('meta[property="og:url"]').attr("content")) ??
      readString(raw.url),
    config.baseUrl,
  );
  const schemaPrice = normalizePrice(
    detailRoot
      .find('[itemprop="priceSpecification"] meta[itemprop="price"]')
      .first()
      .attr("content"),
  );
  const priceFacts = extractFacts($, detailRoot[0] ?? $.root()[0]);
  const address = extractDetailAddress($, detailRoot, config.city);
  const title =
    readString(detailRoot.find("h1").first().nextAll("h2").first().text()) ??
    readString($('meta[property="og:title"]').attr("content")) ??
    stripTitleSuffix(readString($("title").first().text()));
  const description = extractDetailDescription($, detailRoot);
  const images = extractDetailImages($, config.baseUrl);
  const details = isRecord(raw.details) ? raw.details : {};

  return {
    ...raw,
    ...(canonicalUrl ? { url: canonicalUrl, adid: idFromDetailUrl(canonicalUrl) } : {}),
    ...(title ? { title } : {}),
    price: schemaPrice ?? priceFacts.price ?? raw.price,
    warmRent: priceFacts.warmRent ?? raw.warmRent,
    area:
      normalizeArea(
        detailRoot
          .find('[itemprop="floorSize"] meta[itemprop="value"]')
          .first()
          .attr("content"),
      ) ??
      priceFacts.area ??
      raw.area,
    rooms:
      normalizeRooms(
        detailRoot
          .find('[itemprop="numberOfRooms"] meta[itemprop="value"]')
          .first()
          .attr("content"),
      ) ??
      priceFacts.rooms ??
      raw.rooms,
    city: address.city ?? readString(raw.city) ?? config.city,
    postalCode: address.postalCode ?? raw.postalCode,
    address: address.address ?? raw.address,
    images: images.length > 0 ? images : raw.images,
    fullDescription: description ?? raw.fullDescription,
    description: description ?? raw.description,
    details: {
      ...details,
      ...(address.street ? { street: address.street } : {}),
      ...(address.district ? { district: address.district } : {}),
      ...(address.address ? { address: address.address } : {}),
      ...(priceFacts.rentLabel ? { rentLabel: priceFacts.rentLabel } : {}),
    },
  };
}

function mergeRawListings(searchRaw: RawListing, detailRaw: RawListing): RawListing {
  return {
    ...searchRaw,
    ...detailRaw,
    details: {
      ...(isRecord(searchRaw.details) ? searchRaw.details : {}),
      ...(isRecord(detailRaw.details) ? detailRaw.details : {}),
    },
  };
}

function extractFacts(
  $: ReturnType<typeof loadHtml>,
  element: Parameters<ReturnType<typeof loadHtml>>[0],
): {
  readonly rentLabel?: string;
  readonly price?: number;
  readonly warmRent?: number;
  readonly rooms?: number;
  readonly area?: number;
} {
  const facts: Record<string, string> = {};
  $(element)
    .find("dl")
    .each((_index, dl) => {
      const label = readString($(dl).find("dt").first().text());
      const value = readString($(dl).find("dd").first().text());
      if (label && value) facts[label] = value;
    });

  const rentEntry = Object.entries(facts).find(([label]) =>
    /kaltmiete|warmmiete|miete|preis/iu.test(label),
  );
  const warmRentEntry = Object.entries(facts).find(([label]) =>
    /warmmiete|gesamtmiete/iu.test(label),
  );
  return {
    rentLabel: rentEntry?.[0]?.replace(/:$/u, ""),
    price: normalizePrice(rentEntry?.[1]),
    warmRent: normalizePrice(warmRentEntry?.[1]),
    rooms: normalizeRooms(facts.Zimmer),
    area: normalizeArea(facts["Fläche"] ?? facts.Flaeche),
  };
}

function buildAttributes(
  raw: RawListing,
  description: string | undefined,
): ListingAttributes {
  const details = isRecord(raw.details) ? raw.details : {};
  const badges = readStringArray(raw.badges ?? details.badges);
  const text = `${description ?? ""} ${badges.join(" ")} ${readString(raw.title) ?? ""}`;
  const district = readString(details.district);
  const street = readString(details.street);
  const address = readString(raw.address) ?? readString(details.address);

  return {
    ...(district ? { district } : {}),
    ...(street ? { street } : {}),
    ...(address ? { address } : {}),
    ...(/balkon|loggia/iu.test(text) ? { balcony: true } : {}),
    ...(/terrasse|dachterrasse/iu.test(text) ? { terrace: true } : {}),
    ...(/aufzug|lift|fahrstuhl/iu.test(text) ? { elevator: true } : {}),
    ...(/stellplatz|garage|tiefgarage/iu.test(text) ? { parking: true } : {}),
    ...(/keller/iu.test(text) ? { cellar: true } : {}),
    ...(/möbliert|moebliert|einbauküche|einbaukueche|\bebk\b/iu.test(text)
      ? { furnished: true }
      : {}),
    ...(/haustier|hunde|katzen|tierhaltung/iu.test(text)
      ? { pets_allowed: true }
      : {}),
    ...(/neubau|erstbezug/iu.test(text) ? { new_building: true } : {}),
    ...(/provisionsfrei|provision\s*frei|ohne\s+provision/iu.test(text)
      ? { provisionfrei: true }
      : {}),
  };
}

function extractDetailAddress(
  $: CheerioAPI,
  root: CheerioSelection,
  fallbackCity: string,
): {
  readonly street?: string;
  readonly postalCode?: string;
  readonly city?: string;
  readonly district?: string;
  readonly address?: string;
} {
  const schemaCity = readString(
    root.find('[itemprop="address"] meta[itemprop="addressLocality"]').attr("content"),
  );
  const addressBlock = root
    .find("h2")
    .first()
    .nextAll("div")
    .toArray()
    .map((element) => normalizedLines($(element).text()))
    .find((lines) => lines.some((line) => /\b\d{5}\b/u.test(line)));
  const lines = addressBlock ?? [];
  const postalLineIndex = lines.findIndex((line) => /\b\d{5}\b/u.test(line));
  const street = postalLineIndex > 0 ? lines[postalLineIndex - 1] : undefined;
  const postalLine = postalLineIndex >= 0 ? lines[postalLineIndex] : undefined;
  const postalCode = postalLine?.match(/\b\d{5}\b/u)?.[0];
  const cityDistrict = postalLine
    ?.replace(/^.*?\b\d{5}\b\s*/u, "")
    .trim();
  const [cityPart, districtPart] = cityDistrict?.split(/\s*,\s*/u, 2) ?? [];
  const city = readString(cityPart) ?? schemaCity ?? fallbackCity;
  const district = readString(districtPart);
  const address = [street, [postalCode, city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return {
    street,
    postalCode,
    city,
    district,
    address: district ? `${address}, ${district}` : address || undefined,
  };
}

function extractDetailImages(
  $: CheerioAPI,
  baseUrl: string,
): string[] {
  const gallerySources = $("#gallery-lightbox .lightbox-slider img[src]")
    .toArray()
    .map((image) => $(image).attr("src"));
  const thumbnailSources = $(".gallery-slider a.gallery-toggle img[src]")
    .toArray()
    .map((image) => $(image).attr("src"));
  const sources =
    gallerySources.length > 0
      ? gallerySources
      : thumbnailSources.length > 0
        ? thumbnailSources
        : [$('meta[property="og:image"]').attr("content")];
  const seen = new Set<string>();

  return sources.flatMap((source) => {
    const resolved = safeWohnungsboerseImageUrl(readString(source), baseUrl);
    if (!resolved || /obj_img_placeholder|objnoimg/iu.test(resolved)) return [];
    const key = imageDedupeKey(resolved);
    if (seen.has(key)) return [];
    seen.add(key);
    return [resolved];
  });
}

function extractDetailDescription(
  $: CheerioAPI,
  root: CheerioSelection,
): string | undefined {
  const descriptionHeading = root
    .find("h3")
    .toArray()
    .find((element) => /objektbeschreibung/iu.test($(element).text()));
  if (descriptionHeading) {
    const html = $(descriptionHeading).next("div").html();
    const text = html
      ? readString(html.replace(/<br\s*\/?>/giu, "\n").replace(/<[^>]+>/gu, " "))
      : readString($(descriptionHeading).next("div").text());
    if (text) return text;
  }

  return readString($('meta[name="description"]').attr("content"));
}

function normalizedLines(value: string): string[] {
  return value
    .split(/\n+/u)
    .map((line) => readString(line))
    .filter((line): line is string => line !== undefined);
}

function imageDedupeKey(value: string): string {
  const url = new URL(value);
  return url.searchParams.get("id") ?? url.pathname;
}

function stripTitleSuffix(value: string | undefined): string | undefined {
  return value?.replace(/\s+-\s+wohnungsboerse\.net\s*$/iu, "").trim();
}

function splitLocation(
  location: string | undefined,
  fallbackCity: string,
): { readonly city: string; readonly district?: string } {
  if (!location) return { city: fallbackCity };
  const [cityPart, districtPart] = location.split(/\s+-\s+/u, 2);
  return {
    city: readString(cityPart) ?? fallbackCity,
    district: readString(districtPart),
  };
}

function canonicalDetailUrl(
  value: string | undefined,
  baseUrl = WOHNUNGSBOERSE_BASE_URL,
): string | undefined {
  const safeUrl = safeWohnungsboerseUrl(value, baseUrl);
  if (!safeUrl) return undefined;

  try {
    const url = new URL(safeUrl);
    const id = idFromDetailUrl(url.toString());
    if (!id) return undefined;
    return `${WOHNUNGSBOERSE_BASE_URL}/immodetail/${id}`;
  } catch {
    return undefined;
  }
}

function idFromDetailUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.pathname.match(/^\/immodetail\/(\d+)\/?$/u)?.[1];
  } catch {
    return value.match(/\/immodetail\/(\d+)(?:[/?#]|$)/u)?.[1];
  }
}

function idFromCardClass(value: string | undefined): string | undefined {
  return value?.match(/(?:^|\s)estate_(\d+)(?:\s|$)/u)?.[1];
}

function safeWohnungsboerseUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(
      value.startsWith("//") ? `https:${value}` : value,
      baseUrl,
    );
    if (url.protocol !== "https:" || !isWohnungsboerseHost(url.hostname)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function safeWohnungsboerseImageUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  const resolved = safeWohnungsboerseUrl(value, baseUrl);
  if (!resolved) return undefined;

  const url = new URL(resolved);
  return url.pathname.startsWith("/assets/estates/") ? url.toString() : undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized || undefined;
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

function normalizeArea(value: unknown): number | undefined {
  const parsed = parseGermanNumber(value);
  return parsed !== undefined && parsed >= 5 && parsed <= 1000
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWohnungsboerseBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname.replace(/\/+$/u, "") === "" &&
      isWohnungsboerseHost(url.hostname)
    );
  } catch {
    return false;
  }
}

function isWohnungsboerseHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "www.wohnungsboerse.net" ||
    normalized === "wohnungsboerse.net"
  );
}

function usesDisallowedAjaxOrRssPath(value: string): boolean {
  try {
    const url = new URL(value, "https://www.wohnungsboerse.invalid");
    const decodedTarget = safeDecodeURIComponent(`${url.pathname}${url.search}`);
    return (
      (/^\/searches\/index(?:[/?]|$)/iu.test(decodedTarget) &&
        /(?:^|[/?&])rss(?::|=)1(?:[/?&]|$)/iu.test(decodedTarget)) ||
      /(?:^|\/)searches\/ajax_[^/?&]*(?:[/?&]|$)/iu.test(
        decodedTarget,
      ) ||
      /(?:^|\/)ajax_[^/?&]*(?:[/?&]|$)/iu.test(decodedTarget)
    );
  } catch {
    const decoded = safeDecodeURIComponent(value);
    return (
      /(?:^|[/?&])rss(?::|=)1(?:[/?&]|$)/iu.test(decoded) ||
      /(?:^|\/)searches\/ajax_[^/?&]*(?:[/?&]|$)/iu.test(decoded) ||
      /(?:^|\/)ajax_[^/?&]*(?:[/?&]|$)/iu.test(decoded)
    );
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
