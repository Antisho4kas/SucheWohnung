import { z } from "zod";
import * as cheerio from "cheerio";
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
import { ConnectorAbortError, ConnectorConfigError } from "./errors.js";
import { extractJsonLd, type JsonLdObject } from "./extractors/json-ld.js";
import { loadHtml, normalizeText } from "./extractors/selector.js";

export const IMMOBILO_SOURCE_SLUG = "immobilo";

const ImmobiloConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default("https://www.immobilo.de")
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: z.string().min(1).default("/robots.txt"),
  sitemapIndexUrl: z.string().min(1).nullable().default("/sitemap.xml"),
  sitemapSerpUrl: z.string().min(1).default("/sitemap-serp.xml"),
  sitemapExpUrl: z.string().min(1).default("/sitemap-exp.xml"),
  sitemapSerpPattern: z.string().min(1).default("sitemap-serp"),
  sitemapExpPattern: z.string().min(1).default("sitemap-exp"),
  maxSitemapUrls: z.number().int().min(1).max(100_000).default(10_000),
  maxSerpPages: z.number().int().min(0).max(10_000).default(500),
  maxExposePages: z.number().int().min(1).max(50_000).default(5_000),
  pageDelayMs: z.number().int().min(0).max(60_000).default(1_000),
  userAgent: z.string().min(1).default("SucheWohnung/1.0"),
  aggregator: z.boolean().default(true),
  dedupeRisk: z.enum(["high", "elevated"]).default("high"),
});

type ImmobiloConfig = z.infer<typeof ImmobiloConfigSchema>;
type DiscoveryKind = "sitemap-exp" | "sitemap-serp";

interface SitemapEntry {
  readonly url: string;
  readonly lastmod?: Date;
}

interface ExposeCandidate {
  readonly url: string;
  readonly discoveredVia: DiscoveryKind;
  readonly discoveredUrl: string;
  readonly lastmod?: Date;
}

const TRACKING_PARAMS = new Set([
  "utm",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

const parseConfig = (ctx: ConnectorContext): ImmobiloConfig =>
  parseConnectorConfig(ImmobiloConfigSchema, ctx.config, IMMOBILO_SOURCE_SLUG);

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

export class ImmobiloConnector implements SourceConnector {
  readonly slug = IMMOBILO_SOURCE_SLUG;
  readonly type = "scrape" as const;

  async healthCheck(ctx: ConnectorContext): Promise<HealthStatus> {
    try {
      const config = parseConfig(ctx);
      const healthUrl = normalizeSourceUrl(
        config.healthPath,
        config.baseUrl,
        false,
      );
      if (!healthUrl) return { healthy: false, detail: "Invalid healthPath" };
      const res = await ctx.http.get(healthUrl.toString(), {
        ...createConnectorRequestInit(config, ctx.signal),
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
    let config: ImmobiloConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(`Immobilo config error: ${configErrorDetail(error)}`);
      return;
    }

    try {
      const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
      const candidateLimit = Math.min(maxItems, config.maxExposePages);
      const candidates = await discoverExposeCandidates(
        ctx,
        config,
        opts,
        candidateLimit,
      );
      let yielded = 0;
      let fetchedExposes = 0;

      for (const candidate of candidates.values()) {
        if (yielded >= maxItems || fetchedExposes >= config.maxExposePages)
          break;
        fetchedExposes++;

        let raw: RawListing | undefined;
        try {
          const html = await fetchText(ctx, config, candidate.url);
          raw = parseExpose(html, candidate, config);
        } catch (error) {
          if (isCancellationError(error, ctx.signal)) throw error;
          ctx.logger.warn(`Skipping Immobilo expose: ${String(error)}`, {
            url: candidate.url,
          });
          continue;
        }
        if (!raw) continue;

        yield raw;
        yielded++;

        if (config.pageDelayMs > 0 && yielded < maxItems) {
          await wait(config.pageDelayMs, ctx.signal);
        }
      }
    } catch (error) {
      if (isCancellationError(error, ctx.signal)) throw error;
      ctx.logger.error(`Immobilo fetch error: ${String(error)}`);
    }
  }

  map(raw: RawListing): NormalizedListing {
    const images = Array.isArray(raw.images) ? raw.images : [];
    const attributes = asRecord(raw.attributes);

    return {
      sourceSlug: this.slug,
      externalId: String(raw.adid ?? raw.externalId ?? ""),
      url: String(raw.url ?? ""),
      title: stringValue(raw.title),
      price: numberValue(raw.price),
      warmRent: numberValue(raw.warmRent),
      area: numberValue(raw.area),
      rooms: numberValue(raw.rooms),
      city: stringValue(raw.city),
      postalCode: stringValue(raw.postalCode),
      dealType: "rent",
      attributes,
      images: images
        .filter((image): image is string => typeof image === "string")
        .map((url, position) => ({ url, position })),
      raw,
    };
  }
}

async function discoverExposeCandidates(
  ctx: ConnectorContext,
  config: ImmobiloConfig,
  opts: FetchOptions,
  limit: number,
): Promise<Map<string, ExposeCandidate>> {
  const candidates = new Map<string, ExposeCandidate>();
  if (limit <= 0) return candidates;

  if (config.sitemapIndexUrl) {
    const indexEntries = await fetchSitemapEntries(
      ctx,
      config,
      config.sitemapIndexUrl,
    );
    for (const sitemap of indexEntries) {
      if (candidates.size >= limit) return candidates;
      const url = normalizeSourceUrl(sitemap.url, config.baseUrl, false);
      if (!url?.pathname.includes(config.sitemapExpPattern)) continue;
      addExpCandidates(
        candidates,
        config,
        opts,
        await fetchSitemapEntries(ctx, config, url.toString()),
        limit,
      );
    }
    for (const sitemap of indexEntries) {
      if (candidates.size >= limit) return candidates;
      const url = normalizeSourceUrl(sitemap.url, config.baseUrl, false);
      if (!url?.pathname.includes(config.sitemapSerpPattern)) continue;
      await addSerpCandidates(
        ctx,
        candidates,
        config,
        opts,
        await fetchSitemapEntries(ctx, config, url.toString()),
        limit,
      );
    }
    return candidates;
  }

  addExpCandidates(
    candidates,
    config,
    opts,
    await fetchSitemapEntries(ctx, config, config.sitemapExpUrl),
    limit,
  );
  if (candidates.size >= limit) return candidates;
  await addSerpCandidates(
    ctx,
    candidates,
    config,
    opts,
    await fetchSitemapEntries(ctx, config, config.sitemapSerpUrl),
    limit,
  );

  return candidates;
}

function addExpCandidates(
  candidates: Map<string, ExposeCandidate>,
  config: ImmobiloConfig,
  opts: FetchOptions,
  entries: SitemapEntry[],
  limit: number,
): void {
  for (const entry of entries) {
    if (candidates.size >= limit) break;
    if (isOlderThan(entry.lastmod, opts.updatedSince)) continue;
    addExposeCandidate(candidates, config, entry.url, "sitemap-exp", entry);
  }
}

async function addSerpCandidates(
  ctx: ConnectorContext,
  candidates: Map<string, ExposeCandidate>,
  config: ImmobiloConfig,
  opts: FetchOptions,
  entries: SitemapEntry[],
  limit: number,
): Promise<void> {
  let fetchedSerpPages = 0;
  for (const entry of entries) {
    if (candidates.size >= limit) break;
    if (isOlderThan(entry.lastmod, opts.updatedSince)) continue;
    const directExpose = normalizeExposeUrl(entry.url, config.baseUrl);
    if (directExpose) {
      addCandidate(candidates, {
        url: directExpose.url,
        discoveredVia: "sitemap-serp",
        discoveredUrl: entry.url,
        lastmod: entry.lastmod,
      });
      continue;
    }

    if (!isRentSerpUrl(entry.url, config.baseUrl)) continue;
    if (fetchedSerpPages >= config.maxSerpPages) break;

    const html = await fetchText(ctx, config, entry.url);
    fetchedSerpPages++;
    for (const link of extractExposeLinks(html, config.baseUrl)) {
      if (candidates.size >= limit) break;
      addCandidate(candidates, {
        url: link,
        discoveredVia: "sitemap-serp",
        discoveredUrl: entry.url,
        lastmod: entry.lastmod,
      });
    }
  }
}

async function fetchSitemapEntries(
  ctx: ConnectorContext,
  config: ImmobiloConfig,
  pathOrUrl: string,
): Promise<SitemapEntry[]> {
  const xml = await fetchText(ctx, config, pathOrUrl);
  const $ = cheerio.load(xml, { xml: true });
  const entries: SitemapEntry[] = [];

  $("url, sitemap").each((_index, element) => {
    if (entries.length >= config.maxSitemapUrls) return false;
    const loc = normalizeText($(element).find("loc").first().text());
    if (!loc) return;
    const lastmodText = normalizeText(
      $(element).find("lastmod").first().text(),
    );
    entries.push({
      url: loc,
      lastmod: parseDate(lastmodText),
    });
  });

  return entries;
}

async function fetchText(
  ctx: ConnectorContext,
  config: ImmobiloConfig,
  pathOrUrl: string,
): Promise<string> {
  const url = normalizeSourceUrl(pathOrUrl, config.baseUrl, false)?.toString();
  if (!url) throw new Error(`Blocked non-Immobilo URL: ${pathOrUrl}`);
  const res = await ctx.http.get(
    url,
    createConnectorRequestInit(config, ctx.signal),
  );
  if (!isSuccessful(res.status)) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function parseExpose(
  html: string,
  candidate: ExposeCandidate,
  config: ImmobiloConfig,
): RawListing | undefined {
  const $ = loadHtml(html);
  const jsonLd = extractJsonLd(html);
  const primary = findPrimaryJsonLd(jsonLd);
  const offer = firstObject(valueAt(primary, "offers"));
  const address = firstObject(valueAt(primary, "address"));
  const canonicalRaw =
    $("link[rel='canonical']").first().attr("href") ??
    $("meta[property='og:url']").first().attr("content") ??
    candidate.url;
  const canonical =
    normalizeExposeUrl(canonicalRaw, config.baseUrl) ??
    normalizeExposeUrl(candidate.url, config.baseUrl);
  if (!canonical) return undefined;

  const description = firstString([
    stringFromJson(valueAt(primary, "description")),
    $("meta[property='og:description']").first().attr("content"),
  ]);
  const title = firstString([
    stringFromJson(valueAt(primary, "name")),
    $("meta[property='og:title']").first().attr("content"),
    $("h1").first().text(),
  ]);
  const bodyText = normalizeText($("body").text());
  const exposeText = extractExposeText($);
  const originalUrl = normalizeExternalUrl(
    firstString([
      stringFromJson(valueAt(offer, "url")),
      $("a[rel~='nofollow']").first().attr("href"),
    ]),
    config.baseUrl,
  );
  const originalSourceName = firstString([
    $("meta[name='immobilo:provider']").first().attr("content"),
    extractOriginalSourceName(bodyText),
  ]);
  const combinedText = `${title ?? ""} ${description ?? ""} ${bodyText}`;
  if (
    isUnsupportedListing(
      `${canonical.url} ${title ?? ""} ${description ?? ""} ${exposeText}`,
    )
  )
    return undefined;
  const attributes = {
    aggregator: config.aggregator,
    dedupe_risk: config.dedupeRisk,
    ...(originalSourceName ? { original_source_name: originalSourceName } : {}),
    ...(originalUrl ? { original_url: originalUrl } : {}),
    ...extractAttributes(combinedText),
  };
  const sourceMetadata = {
    sourceSlug: IMMOBILO_SOURCE_SLUG,
    aggregator: config.aggregator,
    dedupeRisk: config.dedupeRisk,
    discoveredVia: candidate.discoveredVia,
    discoveredUrl: normalizeSourceUrl(
      candidate.discoveredUrl,
      config.baseUrl,
      false,
    )?.toString(),
    canonicalUrl: canonical.url,
    ...(originalUrl ? { originalUrl } : {}),
    ...(originalSourceName ? { originalSourceName } : {}),
  };

  return {
    adid: canonical.externalId,
    externalId: canonical.externalId,
    url: canonical.url,
    title,
    price: parseNumber(
      firstString([
        stringFromJson(valueAt(offer, "price")),
        textAfterLabel($, "Kaltmiete"),
        $(".price").first().text(),
      ]),
    ),
    warmRent: parseNumber(textAfterLabel($, "Warmmiete")),
    area: parseNumber(
      firstString([
        stringFromJson(extractFloorSize(valueAt(primary, "floorSize"))),
        textAfterLabel($, "Wohnflaeche"),
        textAfterLabel($, "Wohnfläche"),
        $(".area").first().text(),
      ]),
    ),
    rooms: parseNumber(
      firstString([
        stringFromJson(valueAt(primary, "numberOfRooms")),
        textAfterLabel($, "Zimmer"),
        $(".rooms").first().text(),
      ]),
    ),
    postalCode: firstString([
      stringFromJson(valueAt(address, "postalCode")),
      $(".postal-code").first().text(),
      extractPostalCode(bodyText),
    ]),
    city: firstString([
      stringFromJson(valueAt(address, "addressLocality")),
      $(".city").first().text(),
    ]),
    description,
    images: extractImages($, primary, config.baseUrl),
    attributes,
    originalUrl,
    originalSourceName,
    sourceMetadata,
    discoveredVia: candidate.discoveredVia,
    discoveredUrl: candidate.discoveredUrl,
  };
}

function addExposeCandidate(
  candidates: Map<string, ExposeCandidate>,
  config: ImmobiloConfig,
  url: string,
  discoveredVia: DiscoveryKind,
  entry: SitemapEntry,
): void {
  const expose = normalizeExposeUrl(url, config.baseUrl);
  if (!expose) return;
  addCandidate(candidates, {
    url: expose.url,
    discoveredVia,
    discoveredUrl: entry.url,
    lastmod: entry.lastmod,
  });
}

function addCandidate(
  candidates: Map<string, ExposeCandidate>,
  candidate: ExposeCandidate,
): void {
  if (!candidates.has(candidate.url)) candidates.set(candidate.url, candidate);
}

function extractExposeLinks(html: string, baseUrl: string): string[] {
  const $ = loadHtml(html);
  const links: string[] = [];

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const expose = normalizeExposeUrl(href, baseUrl);
    if (expose && !links.includes(expose.url)) links.push(expose.url);
  });

  return links;
}

function normalizeExposeUrl(
  rawUrl: string | undefined,
  baseUrl: string,
): { url: string; externalId: string } | undefined {
  if (!rawUrl) return undefined;
  const url = normalizeSourceUrl(rawUrl, baseUrl, true);
  if (!url) return undefined;
  const exposeMatch = url.pathname.match(/\/expose\/([^/]+)\/?$/iu);
  const immobilienMatch = url.pathname.match(
    /\/immobilien\/[^/]*-([A-Za-z0-9]+)\/?$/u,
  );
  const externalId = exposeMatch?.[1] ?? immobilienMatch?.[1];
  if (!externalId) return undefined;
  url.search = "";
  url.hash = "";
  return {
    url: url.toString().replace(/\/$/u, ""),
    externalId: decodeURIComponent(externalId).trim(),
  };
}

function normalizeExternalUrl(
  rawUrl: string | undefined,
  baseUrl: string,
): string | undefined {
  const url = normalizeUrl(rawUrl, baseUrl, { forceHttps: false });
  if (!url || !["http:", "https:"].includes(url.protocol)) return undefined;
  return url?.toString().replace(/\/$/u, "");
}

function normalizeSourceUrl(
  rawUrl: string | undefined,
  baseUrl: string,
  stripAllSearch: boolean,
): URL | undefined {
  const url = normalizeUrl(rawUrl, baseUrl, {
    forceHttps: true,
    stripAllSearch,
  });
  return url && sameOrigin(url, baseUrl) ? url : undefined;
}

function normalizeUrl(
  rawUrl: string | undefined,
  baseUrl: string,
  options: { readonly forceHttps: boolean; readonly stripAllSearch?: boolean },
): URL | undefined {
  if (!rawUrl?.trim()) return undefined;
  try {
    const url = new URL(resolveConnectorUrl(baseUrl, rawUrl.trim()));
    if (options.forceHttps) url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        options.stripAllSearch ||
        key.toLowerCase().startsWith("utm_") ||
        TRACKING_PARAMS.has(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/u, "");
    return url;
  } catch {
    return undefined;
  }
}

function sameOrigin(url: URL, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    base.protocol = "https:";
    base.hostname = base.hostname.toLowerCase();
    return url.origin === base.origin;
  } catch {
    return false;
  }
}

function isRentSerpUrl(rawUrl: string, baseUrl: string): boolean {
  const url = normalizeSourceUrl(rawUrl, baseUrl, false);
  if (!url) return false;
  const path = url.pathname.toLowerCase();
  return !path.includes("kaufen") && /mieten|wohnung|wohnungen/u.test(path);
}

function isOlderThan(
  date: Date | undefined,
  threshold: Date | undefined,
): boolean {
  return Boolean(date && threshold && date < threshold);
}

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function findPrimaryJsonLd(values: JsonLdObject[]): JsonLdObject | undefined {
  return (
    values.find((value) => hasType(value, "Apartment")) ??
    values.find((value) => hasType(value, "Residence")) ??
    values.find((value) => hasType(value, "Product")) ??
    values[0]
  );
}

function hasType(value: JsonLdObject, type: string): boolean {
  const rawType = value["@type"];
  if (typeof rawType === "string") return rawType === type;
  return Array.isArray(rawType) && rawType.includes(type);
}

function valueAt(source: JsonLdObject | undefined, key: string): unknown {
  return source?.[key];
}

function firstObject(value: unknown): JsonLdObject | undefined {
  if (Array.isArray(value)) return value.map(firstObject).find(Boolean);
  return isRecord(value) ? (value as JsonLdObject) : undefined;
}

function extractFloorSize(value: unknown): unknown {
  const object = firstObject(value);
  return object ? (object.value ?? object["@value"] ?? object) : value;
}

function stringFromJson(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (isRecord(value)) {
    const nested = value.value ?? value["@value"] ?? value.url;
    return typeof nested === "string" || typeof nested === "number"
      ? String(nested)
      : undefined;
  }
  return undefined;
}

function firstString(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value ? normalizeText(value) : undefined;
    if (normalized) return normalized;
  }
  return undefined;
}

function textAfterLabel(
  $: ReturnType<typeof loadHtml>,
  label: string,
): string | undefined {
  let found: string | undefined;
  $("dt").each((_index, element) => {
    if (found) return false;
    const text = normalizeText($(element).text());
    if (normalizeKey(text) !== normalizeKey(label)) return;
    const value = normalizeText($(element).next("dd").text());
    if (value) found = value;
  });
  return found;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .replace(/ß/gu, "ss")
    .replace(/[^a-z0-9]/gu, "");
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/\d[\d.,]*/u);
  if (!match?.[0]) return undefined;
  const raw = match[0];
  const normalized = raw.includes(",")
    ? raw.replace(/\./gu, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/u.test(raw)
      ? raw.replace(/\./gu, "")
      : raw.replace(/,/gu, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function extractPostalCode(value: string): string | undefined {
  return value.match(/\b\d{5}\b/u)?.[0];
}

function extractOriginalSourceName(value: string): string | undefined {
  const match = value.match(/Quelle:\s*([\p{L}\p{N} ._-]+)/u);
  return match?.[1] ? normalizeText(match[1]) : undefined;
}

function extractExposeText($: ReturnType<typeof loadHtml>): string {
  const scoped = $(
    "[data-testid='expose'], article, main [class*='expose'], main [class*='listing']",
  )
    .first()
    .text();
  return normalizeText(scoped || "");
}

function extractAttributes(text: string): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries({
      balcony: /balkon/i.test(text),
      terrace: /terrasse|dachterrasse/i.test(text),
      elevator: /aufzug|lift|fahrstuhl/i.test(text),
      parking: /stellplatz|garage|tiefgarage/i.test(text),
      cellar: /keller/i.test(text),
      furnished: /moebliert|möbliert|einbauküche|ebk/i.test(text),
      pets_allowed: /haustier|hunde|katzen/i.test(text),
      provisionfrei: /provisionsfrei|provisionfrei/i.test(text),
    }).filter(([, enabled]) => enabled),
  );
}

function isUnsupportedListing(text: string): boolean {
  return /\b(kaufpreis|kaufen|eigentumswohnung|gewerbe|büro|buero|laden|hotel)\b/iu.test(
    text,
  );
}

function extractImages(
  $: ReturnType<typeof loadHtml>,
  primary: JsonLdObject | undefined,
  baseUrl: string,
): string[] {
  const images: string[] = [];
  const add = (value: unknown) => {
    const url = stringFromJson(value);
    const normalized = normalizeExternalUrl(url, baseUrl);
    if (normalized && !images.includes(normalized)) images.push(normalized);
  };
  const jsonImages = valueAt(primary, "image");
  if (Array.isArray(jsonImages)) jsonImages.forEach(add);
  else add(jsonImages);
  add($("meta[property='og:image']").first().attr("content"));
  return images;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
