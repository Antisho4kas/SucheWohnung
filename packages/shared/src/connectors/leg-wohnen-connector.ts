import * as cheerio from "cheerio";
import { z } from "zod";
import type {
  ConnectorContext,
  FetchOptions,
  HealthStatus,
  SourceConnector,
} from "./contract.js";
import type { NormalizedListing, RawListing } from "../domain/listing.js";
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

export const LEG_WOHNEN_SOURCE_SLUG = "leg-wohnen";

const HttpOrPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !/^[a-z][a-z0-9+.-]*:/iu.test(value) || /^https?:\/\//iu.test(value),
    { message: "must be an HTTP(S) URL or a relative path" },
  );

const LegWohnenConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default("https://www.leg-wohnen.de")
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: z.string().min(1).default("/sitemap.xml"),
  sitemapIndexPath: HttpOrPathSchema.default("/sitemap.xml"),
  sitemapUrls: z.array(HttpOrPathSchema).default([]),
  city: z.string().min(1).default("Mönchengladbach"),
  minRooms: z.number().min(0.5).max(20).optional(),
  maxRooms: z.number().min(0.5).max(20).optional(),
  maxPages: z.number().int().min(1).max(50).default(1),
  rateLimitMs: z.number().int().min(0).max(60_000).default(1_000),
  userAgent: z.string().min(1).default("SucheWohnung/1.0"),
}).refine(
  (config) =>
    config.minRooms === undefined ||
    config.maxRooms === undefined ||
    config.maxRooms >= config.minRooms,
  { message: "maxRooms must be greater than or equal to minRooms" },
);

type LegWohnenConfig = z.infer<typeof LegWohnenConfigSchema>;

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;
const LEG_HOSTS = new Set(["www.leg-wohnen.de", "leg-wohnen.de"]);

const parseConfig = (ctx: ConnectorContext): LegWohnenConfig =>
  parseConnectorConfig(
    LegWohnenConfigSchema,
    ctx.config,
    LEG_WOHNEN_SOURCE_SLUG,
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

export class LegWohnenConnector implements SourceConnector {
  readonly slug = LEG_WOHNEN_SOURCE_SLUG;
  readonly type = "scrape" as const;

  async healthCheck(ctx: ConnectorContext): Promise<HealthStatus> {
    try {
      const config = parseConfig(ctx);
      const requestInit = createConnectorRequestInit(config, ctx.signal);
      const res = await ctx.http.get(resolveLegUrl(config, config.healthPath), {
        ...requestInit,
        method: "HEAD",
      });
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
    let config: LegWohnenConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(`LEG Wohnen config error: ${configErrorDetail(error)}`);
      return;
    }

    const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
    if (maxItems <= 0) return;

    const requestInit = createConnectorRequestInit(config, ctx.signal);
    let sitemapUrls: string[];
    try {
      sitemapUrls = config.sitemapUrls.length
        ? config.sitemapUrls.map((url) => resolveLegUrl(config, url))
        : await discoverWohnungenSitemaps(ctx, config, requestInit);
    } catch (error) {
      if (isCancellationError(error, ctx.signal)) throw error;
      ctx.logger.error(
        `LEG Wohnen sitemap discovery error: ${stringifyError(error)}`,
      );
      return;
    }

    const seenDetailUrls = new Set<string>();
    let yielded = 0;

    for (const sitemapUrl of sitemapUrls.slice(0, config.maxPages)) {
      if (yielded >= maxItems) break;

      let detailUrls: string[];
      try {
        const sitemapXml = await fetchText(ctx, sitemapUrl, requestInit);
        detailUrls = extractDetailUrls(sitemapXml, config.baseUrl);
      } catch (error) {
        if (isCancellationError(error, ctx.signal)) throw error;
        ctx.logger.warn(
          `LEG Wohnen sitemap skipped: ${stringifyError(error)}`,
          { sitemapUrl },
        );
        continue;
      }

      for (const detailUrl of detailUrls) {
        if (yielded >= maxItems) break;

        const normalizedDetailUrl = normalizeDetailUrl(
          detailUrl,
          config.baseUrl,
        );
        if (seenDetailUrls.has(normalizedDetailUrl)) continue;
        seenDetailUrls.add(normalizedDetailUrl);

        try {
          const html = await fetchText(ctx, normalizedDetailUrl, requestInit);
          const raw = parseDetailPage(
            html,
            normalizedDetailUrl,
            config.baseUrl,
          );
          if (raw && matchesConfig(raw, config)) {
            yield raw;
            yielded++;
          }
        } catch (error) {
          if (isCancellationError(error, ctx.signal)) throw error;
          ctx.logger.warn(
            `LEG Wohnen detail skipped: ${stringifyError(error)}`,
            { detailUrl: normalizedDetailUrl },
          );
        } finally {
          if (config.rateLimitMs > 0 && yielded < maxItems) {
            await wait(config.rateLimitMs, ctx.signal);
          }
        }
      }
    }
  }

  map(raw: RawListing): NormalizedListing {
    const rawUrl = String(raw.url ?? "");
    const url = normalizeDetailUrl(rawUrl, "https://www.leg-wohnen.de");
    const externalId = extractExternalId(url) || String(raw.adid ?? "");
    const title = (raw.title as string | undefined) || undefined;
    const priceVal = raw.price as number | undefined;
    const warmRentVal = raw.warmRent as number | undefined;
    const areaVal = raw.area as number | undefined;
    const roomsVal = raw.rooms as number | undefined;
    const city = (raw.city as string | undefined) || undefined;
    const postalCode = (raw.postalCode as string | undefined) || undefined;
    const description =
      (raw.fullDescription as string | undefined) ||
      (raw.description as string | undefined) ||
      "";
    const availability = (raw.availability as string | undefined) || undefined;
    const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];

    const textForAttributes = `${title ?? ""} ${description}`;

    return {
      sourceSlug: this.slug,
      externalId,
      url,
      title,
      price: priceVal !== undefined && priceVal >= 50 ? priceVal : undefined,
      warmRent:
        warmRentVal !== undefined && warmRentVal >= 50
          ? warmRentVal
          : undefined,
      area: areaVal,
      rooms: roomsVal,
      city,
      postalCode,
      dealType: "rent",
      attributes: {
        availability,
        balcony: /balkon/i.test(textForAttributes) || undefined,
        terrace: /terrasse/i.test(textForAttributes) || undefined,
        elevator: /aufzug|lift|fahrstuhl/i.test(textForAttributes) || undefined,
        cellar: /keller/i.test(textForAttributes) || undefined,
        parking:
          /stellplatz|garage|tiefgarage/i.test(textForAttributes) || undefined,
        provisionfrei: true,
      },
      images: images.map((imageUrl, position) => ({ url: imageUrl, position })),
      raw,
    };
  }
}

async function discoverWohnungenSitemaps(
  ctx: ConnectorContext,
  config: LegWohnenConfig,
  requestInit: Parameters<ConnectorContext["http"]["get"]>[1],
): Promise<string[]> {
  const indexUrl = resolveLegUrl(config, config.sitemapIndexPath);
  const xml = await fetchText(ctx, indexUrl, requestInit);
  const sitemapUrls = extractSitemapUrls(xml, config.baseUrl).filter((url) => {
    const parsed = new URL(url);
    return parsed.searchParams.get("sitemap") === "wohnungen";
  });

  return sitemapUrls.length > 0 ? sitemapUrls : [indexUrl];
}

async function fetchText(
  ctx: ConnectorContext,
  url: string,
  init: Parameters<ConnectorContext["http"]["get"]>[1],
): Promise<string> {
  const response = await ctx.http.get(url, init);
  if (!isSuccessful(response.status)) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function extractSitemapUrls(xml: string, baseUrl: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  const urls: string[] = [];
  $("sitemap > loc").each((_index, element) => {
    const url = safeLegUrl($(element).text(), baseUrl);
    if (url) urls.push(url);
  });
  return dedupe(urls);
}

function extractDetailUrls(xml: string, baseUrl: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  const urls: string[] = [];
  $("url > loc").each((_index, element) => {
    const url = normalizeLegDetailUrl($(element).text(), baseUrl);
    if (url && /\/immobilien\/detail\//iu.test(new URL(url).pathname)) {
      urls.push(url);
    }
  });
  return dedupe(urls);
}

function parseDetailPage(
  html: string,
  detailUrl: string,
  baseUrl: string,
): RawListing | undefined {
  const $ = cheerio.load(html);
  const canonicalUrl =
    normalizeLegDetailUrl($("link[rel='canonical']").attr("href"), baseUrl) ??
    normalizeLegDetailUrl(detailUrl, baseUrl);
  if (!canonicalUrl) return undefined;
  const externalId =
    extractExternalId(canonicalUrl) ||
    normalizeText($("[data-chat-msg]").first().attr("data-chat-msg") ?? "");
  const title =
    text($, ".sg-estate-detail-headline") ||
    normalizeText($("meta[property='og:title']").attr("content") ?? "") ||
    text($, "title");
  const description =
    text($, ".sg-estate-detail-description") ||
    normalizeText($("meta[name='description']").attr("content") ?? "");
  const allText = normalizeText($("main").text() || $("body").text());

  if (isNonApartmentPage(html, title, allText)) return undefined;

  const facts = extractFacts($);
  const area =
    parseGermanNumber($("meta[itemprop='floorSize']").attr("content")) ??
    parseGermanNumber(fact(facts, ["Wohnfläche", "Wohnflaeche", "Fläche"])) ??
    parseAreaFromText(`${title} ${allText}`);
  const rooms =
    parseGermanNumber(fact(facts, ["Zimmer", "Anzahl Zimmer"])) ??
    parseRoomsFromText(title) ??
    parseRoomsFromText(allText);
  const price =
    parseGermanNumber(fact(facts, ["Kaltmiete", "Nettokaltmiete"])) ??
    parseColdRentFromText(`${title} ${allText}`);
  const warmRent = parseGermanNumber(
    fact(facts, ["Warmmiete", "Gesamtmiete", "Bruttomiete"]),
  );
  const city = normalizeText(
    $("[itemprop='address'] meta[itemprop='addressLocality']").attr(
      "content",
    ) ?? "",
  );
  const postalCode = normalizeText(
    $("[itemprop='address'] meta[itemprop='postalCode']").attr("content") ?? "",
  );
  const availability = normalizeAvailability(
    fact(facts, ["Bezugsfrei ab", "Verfügbar ab", "Verfuegbar ab", "Frei ab"]),
  );
  const images = extractImages($, baseUrl);

  if (!externalId || !canonicalUrl) return undefined;

  return {
    adid: externalId,
    url: canonicalUrl,
    title,
    price,
    warmRent,
    area,
    rooms,
    city: city || undefined,
    postalCode: /^\d{5}$/u.test(postalCode) ? postalCode : undefined,
    availability,
    images,
    fullDescription: description,
    description,
    details: Object.fromEntries(facts),
    published_at: null,
  };
}

function matchesConfig(raw: RawListing, config: LegWohnenConfig): boolean {
  const city = raw.city as string | undefined;
  if (config.city) {
    if (!city) return false;
    if (
      city.toLocaleLowerCase("de-DE") !== config.city.toLocaleLowerCase("de-DE")
    ) {
      return false;
    }
  }

  const rooms = raw.rooms as number | undefined;
  if (
    config.minRooms !== undefined &&
    (rooms === undefined || rooms < config.minRooms)
  ) {
    return false;
  }
  if (
    config.maxRooms !== undefined &&
    (rooms === undefined || rooms > config.maxRooms)
  ) {
    return false;
  }

  return true;
}

const PARKING_RE =
  /\b(Stellplatz|Stellplätze|Stellplaetze|Parkplatz|Parkplätze|Garage|Garagen|Tiefgarage|Tiefgaragenstellplatz|Außenstellplatz|Aussenstellplatz)\b/iu;
const APARTMENT_TITLE_RE = /\b(Wohnung|Zimmer)\b/iu;
const APARTMENT_BODY_RE = /\b(Wohnung|Zimmer-Wohnung|Wohnfläche)\b/iu;

function isNonApartmentPage(
  html: string,
  title: string,
  pageText: string,
): boolean {
  // IMPORTANT: never test the whole page HTML for parking-category paths such as
  // `/immobilien/stellplaetze-garagen` or `/immobilien/parken`. The site's global
  // navigation links to those categories on EVERY page, including real apartment
  // detail pages, so a whole-HTML match misclassifies every listing as parking
  // and the connector yields nothing. Decide from the listing's own title/body
  // and the page-scoped `<!-- parken -->` marker instead.
  const combined = `${title} ${pageText}`;
  const parkingTitle = PARKING_RE.test(title) && !APARTMENT_TITLE_RE.test(title);
  return (
    /<!--\s*parken\s*-->/iu.test(html) ||
    parkingTitle ||
    (PARKING_RE.test(combined) && !APARTMENT_BODY_RE.test(combined))
  );
}

function extractFacts($: cheerio.CheerioAPI): Map<string, string> {
  const facts = new Map<string, string>();

  $("dt").each((_index, element) => {
    const label = normalizeText($(element).text());
    const value = normalizeText($(element).next("dd").text());
    if (label && value) facts.set(label, value);
  });

  return facts;
}

function fact(
  facts: Map<string, string>,
  labels: string[],
): string | undefined {
  const normalizedLabels = labels.map((label) => normalizeLabel(label));
  for (const [label, value] of facts.entries()) {
    const normalizedLabel = normalizeLabel(label);
    if (
      normalizedLabels.some((candidate) => normalizedLabel.includes(candidate))
    ) {
      return value;
    }
  }
  return undefined;
}

function extractImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();
  $(".sge-gallery a[href], .sge-gallery img[src]").each((_index, element) => {
    const candidate = $(element).attr("href") ?? $(element).attr("src");
    const url = normalizeUrl(candidate, baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push(url);
    }
  });
  return images;
}

function parseAreaFromText(value: string): number | undefined {
  const match = value.match(/(\d[\d\s.,]*)\s*m(?:²|2|&sup2;)/iu);
  return parseGermanNumber(match?.[1]);
}

function parseRoomsFromText(value: string): number | undefined {
  const match = value.match(/(\d+(?:[,.]\d+)?)\s*[- ]?\s*Zimmer/iu);
  return parseGermanNumber(match?.[1]);
}

function parseColdRentFromText(value: string): number | undefined {
  const match = value.match(/für\s+(\d[\d\s.,]*)\s*€\s*kalt/iu);
  return parseGermanNumber(match?.[1]);
}

function parseGermanNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/\u00a0/gu, " ").match(/\d[\d\s.,]*/u);
  if (!match) return undefined;

  let normalized = match[0].replace(/\s+/gu, "");
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./gu, "").replace(",", ".");
  } else if ((normalized.match(/\./gu) ?? []).length > 1) {
    normalized = normalized.replace(/\./gu, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAvailability(value: string | undefined): string | undefined {
  const normalized = normalizeText(value ?? "");
  if (!normalized) return undefined;
  if (/^(ab\s+|sofort|nach\s+)/iu.test(normalized)) return normalized;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/u.test(normalized)) return `ab ${normalized}`;
  return normalized;
}

function normalizeDetailUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url || "/", baseUrl);
  parsed.hash = "";
  parsed.search = "";
  parsed.hostname = parsed.hostname.toLocaleLowerCase("en-US");
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString();
}

function extractExternalId(url: string): string | undefined {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/immobilien\/detail\/([^/]+)/iu);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function resolveLegUrl(config: LegWohnenConfig, pathOrUrl: string): string {
  const url = safeLegUrl(
    resolveConnectorUrl(config.baseUrl, pathOrUrl),
    config.baseUrl,
  );
  if (!url) {
    throw new Error("LEG Wohnen URL must use https://www.leg-wohnen.de");
  }
  return url;
}

function normalizeUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  const normalized = normalizeText(value ?? "");
  if (!normalized) return undefined;
  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function safeLegUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  const url = normalizeUrl(value, baseUrl);
  if (!url) return undefined;

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLocaleLowerCase("en-US");
  if (parsed.protocol !== "https:" || !LEG_HOSTS.has(hostname))
    return undefined;
  parsed.hostname = hostname;
  return parsed.toString();
}

function normalizeLegDetailUrl(
  value: string | undefined,
  baseUrl: string,
): string | undefined {
  const url = safeLegUrl(value, baseUrl);
  if (!url) return undefined;

  const parsed = new URL(url);
  if (!/\/immobilien\/detail\/[^/]+\/?$/iu.test(parsed.pathname))
    return undefined;
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString();
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function normalizeLabel(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("de-DE")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .replace(/ß/gu, "ss");
}

function text($: cheerio.CheerioAPI, selector: string): string {
  return normalizeText($(selector).first().text());
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
