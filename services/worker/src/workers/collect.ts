import { Worker, Queue } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import { recordSourceRunOutcome, startMetricsServer } from "../metrics.js";
import {
  BOOLEAN_ATTRIBUTES,
  createDefaultConnectorRegistry,
  getSourceActivationDecision,
  runQualityGate,
  computeFingerprint,
  deriveKleinanzeigenSearchAreas,
  type ConnectorContext,
  type ConnectorRegistry,
  type DecryptedCredentials,
  type HealthStatus,
  type ListingImage,
  type GeoPoint,
  type NormalizedListing,
  type ProfileForAreas,
} from "@suchewohnung/shared";

type CollectJob = { data: { sourceSlug: string; cursor?: string } };

type JsonObject = Record<string, unknown>;

type SourceRecord = {
  id: string;
  slug: string;
  isActive: boolean;
  config: unknown;
  credentials?: Array<{ type: string; encryptedSecret: unknown }>;
};

type ListingRecord = {
  id: string;
  sourceId: string;
  externalId: string;
  fingerprint: string;
  url: string;
  title: string | null;
  price: unknown;
  warmRent: unknown;
  area: unknown;
  rooms: unknown;
  city: string | null;
  bundesland: string | null;
  postalCode: string | null;
  geo?: GeoPoint | null;
  attributes: unknown;
  status: "active" | "updated" | "expired" | "removed";
  raw?: unknown;
  images?: ListingImageRecord[];
};

type ListingImageRecord = {
  url: string;
  position: number;
  storageKey?: string | null;
};

type HttpRequestInit = Parameters<ConnectorContext["http"]["get"]>[1];

type PrismaLike = {
  source: {
    findUnique(args: unknown): Promise<SourceRecord | null>;
  };
  sourceRun: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  listing: {
    findFirst(args: unknown): Promise<ListingRecord | null>;
    findUnique(args: unknown): Promise<ListingRecord | null>;
    create(args: unknown): Promise<ListingRecord>;
    update(args: unknown): Promise<ListingRecord>;
  };
  listingImage: {
    createMany(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  listingHistory: {
    createMany(args: unknown): Promise<unknown>;
  };
  $executeRaw(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<number>;
  $queryRaw<T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T>;
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
};

type MatchQueueLike = {
  add(name: string, data: JsonObject, opts: JsonObject): Promise<unknown>;
};

type ConnectorRegistryLike = Pick<ConnectorRegistry, "get">;

type MatchEvent = {
  listingId: string;
  event: "created" | "changed";
  changeVersion?: string;
  attributes: unknown;
};

export type CollectDeps = {
  prisma: PrismaLike;
  matchQueue: MatchQueueLike;
  connectors: ConnectorRegistryLike;
  decryptCredential?: (encryptedSecret: unknown) => Promise<JsonObject>;
  /**
   * Loads active search profiles (with their filters) so profile-driven
   * sources can derive their crawl areas. Optional: when absent, sources fall
   * back to their static config.
   */
  loadProfilesForAreas?: () => Promise<ProfileForAreas[]>;
};

type RunMetrics = {
  fetched: number;
  newItems: number;
  updatedItems: number;
  errors: number;
};

type Change = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

const LISTING_FIELDS = [
  "url",
  "title",
  "price",
  "warmRent",
  "area",
  "rooms",
  "city",
  "bundesland",
  "postalCode",
  "attributes",
] as const;

const MATCH_AFFECTING_SIGNIFICANT_FIELDS = new Set<string>([
  "area",
  "rooms",
  "city",
  "bundesland",
  "postalCode",
  "geo",
]);

const MATCH_AFFECTING_ATTRIBUTE_KEYS = new Set<string>(BOOLEAN_ATTRIBUTES);

const MATCH_JOB_OPTIONS = {
  removeOnComplete: 5000,
  removeOnFail: 5000,
};

const PENDING_MATCH_EVENT_KEY = "_collect_pending_match_event";
const PENDING_MATCH_CHANGE_VERSION_KEY =
  "_collect_pending_match_change_version";
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_RETRIES = 2;
const SECRET_KEYS = new Set([
  "authorization",
  "cookie",
  "credentials",
  "encryptedsecret",
  "password",
  "secret",
  "set-cookie",
  "token",
  "apikey",
  "api_key",
]);

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function sanitizeJson(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  )
    return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item, seen));
  }
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, sanitizeJson(entryValue, seen)]),
  );
}

function sanitizeJsonObject(value: unknown): JsonObject {
  return asObject(sanitizeJson(value));
}

function toNullable(value: unknown): unknown | null {
  return value === undefined ? null : value;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return Number(value.toString());
  }
  return Number(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonObject)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, normalizeJson(entryValue)]),
    );
  }
  return value;
}

function withoutPendingMatchEvent(attributes: unknown): JsonObject {
  const {
    [PENDING_MATCH_EVENT_KEY]: _pending,
    [PENDING_MATCH_CHANGE_VERSION_KEY]: _pendingChangeVersion,
    ...rest
  } = asObject(attributes);
  return rest;
}

function withPendingMatchEvent(
  attributes: unknown,
  event: MatchEvent["event"],
  changeVersion?: string,
): JsonObject {
  return sanitizeJsonObject({
    ...asObject(attributes),
    [PENDING_MATCH_EVENT_KEY]: event,
    ...(changeVersion
      ? { [PENDING_MATCH_CHANGE_VERSION_KEY]: changeVersion }
      : {}),
  });
}

function pendingMatchEvent(listing: ListingRecord): MatchEvent | undefined {
  const attributes = asObject(listing.attributes);
  const event = attributes[PENDING_MATCH_EVENT_KEY];
  const changeVersion = attributes[PENDING_MATCH_CHANGE_VERSION_KEY];
  return event === "created" || event === "changed"
    ? {
        listingId: listing.id,
        event,
        changeVersion:
          typeof changeVersion === "string" ? changeVersion : undefined,
        attributes: listing.attributes,
      }
    : undefined;
}

function isSameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeJson(a)) === JSON.stringify(normalizeJson(b));
}

function isSameGeo(a: GeoPoint | null | undefined, b: GeoPoint | undefined) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
}

function imageSignature(
  images: ListingImageRecord[] | ListingImage[],
): Array<{ url: string; position: number }> {
  return images
    .map((image, index) => ({
      url: image.url,
      position: index,
    }))
    .sort((a, b) => a.position - b.position || a.url.localeCompare(b.url));
}

function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value))
    return value.map((item) => redactSecrets(item, seen));
  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, entryValue]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase())
        ? "[REDACTED]"
        : redactSecrets(entryValue, seen),
    ]),
  );
}

async function buildCredentials(
  source: SourceRecord,
  decryptCredential?: (encryptedSecret: unknown) => Promise<JsonObject>,
): Promise<DecryptedCredentials | undefined> {
  const first = source.credentials?.[0];
  if (!first) return undefined;
  if (!decryptCredential) {
    throw new Error(
      "Source credentials are configured but no credential decryptor is available",
    );
  }
  return {
    type: first.type,
    secret: await decryptCredential(first.encryptedSecret),
  };
}

function createLogger(sourceSlug: string): ConnectorContext["logger"] {
  return {
    debug: (msg, meta) =>
      console.log(`[${sourceSlug}] ${msg}`, meta ? redactSecrets(meta) : ""),
    info: (msg, meta) =>
      console.log(`[${sourceSlug}] ${msg}`, meta ? redactSecrets(meta) : ""),
    warn: (msg, meta) =>
      console.warn(`[${sourceSlug}] ${msg}`, meta ? redactSecrets(meta) : ""),
    error: (msg, meta) =>
      console.error(`[${sourceSlug}] ${msg}`, meta ? redactSecrets(meta) : ""),
  };
}

function isPrivateNetworkUrl(url: string): boolean {
  const { hostname } = new URL(url);
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local"))
    return true;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  a.addEventListener("abort", abort, { once: true });
  b.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

async function requestWithRetry(
  source: SourceRecord,
  signal: AbortSignal,
  method: "GET" | "POST",
  url: string,
  init?: HttpRequestInit,
) {
  const config = asObject(source.config);
  if (isPrivateNetworkUrl(url) && config.allowPrivateNetwork !== true) {
    throw new Error(`Blocked private network request: ${url}`);
  }

  const timeoutMs =
    typeof init?.timeoutMs === "number"
      ? init.timeoutMs
      : typeof config.requestTimeoutMs === "number"
        ? config.requestTimeoutMs
        : DEFAULT_HTTP_TIMEOUT_MS;
  const retries =
    typeof config.httpRetries === "number"
      ? config.httpRetries
      : DEFAULT_HTTP_RETRIES;
  const requestMethod = typeof init?.method === "string" ? init.method : method;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, {
        ...(init as RequestInit | undefined),
        method: requestMethod,
        signal: combineSignals(signal, timeoutSignal),
      });
      if (response.status < 500 || attempt === retries)
        return adaptFetchResponse(response);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function buildConnectorContext(
  source: SourceRecord,
  signal: AbortSignal,
  decryptCredential?: (encryptedSecret: unknown) => Promise<JsonObject>,
): Promise<ConnectorContext> {
  return {
    config: asObject(source.config),
    credentials: await buildCredentials(source, decryptCredential),
    http: {
      get: async (url, init) =>
        requestWithRetry(source, signal, "GET", url, init),
      post: async (url, init) =>
        requestWithRetry(source, signal, "POST", url, init),
    },
    browser: {
      withPage: async () => {
        throw new Error(
          "Playwright browser pool is not configured for collect worker",
        );
      },
    },
    logger: createLogger(source.slug),
    signal,
  };
}

function adaptFetchResponse(
  response: Response,
): ConnectorContext["http"] extends {
  get: (...args: never[]) => Promise<infer R>;
}
  ? R
  : never {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text: () => response.text(),
    json: <T = unknown>() => response.json() as Promise<T>,
  } as ConnectorContext["http"] extends {
    get: (...args: never[]) => Promise<infer R>;
  }
    ? R
    : never;
}

function normalizeListingData(
  listing: NormalizedListing,
  fingerprint: string,
  sourceId: string,
  raw: unknown,
): Omit<ListingRecord, "id"> {
  return {
    sourceId,
    externalId: listing.externalId,
    fingerprint,
    url: listing.url,
    title: listing.title ?? null,
    price: listing.price ?? null,
    warmRent: listing.warmRent ?? null,
    area: listing.area ?? null,
    rooms: listing.rooms ?? null,
    city: listing.city ?? null,
    bundesland: listing.bundesland ?? null,
    postalCode: listing.postalCode ?? null,
    attributes: sanitizeJsonObject(listing.attributes),
    status: "active",
    raw: sanitizeJson(listing.raw ?? raw),
  };
}

function quarantineListingData(args: {
  normalized: JsonObject;
  source: SourceRecord;
  raw: unknown;
  fingerprint: string;
  issues: string[];
}): Omit<ListingRecord, "id"> {
  const attributes = sanitizeJsonObject({
    ...asObject(args.normalized.attributes),
    _quarantine: true,
    _quality_issues: args.issues,
  });

  return {
    sourceId: args.source.id,
    externalId: String(args.normalized.externalId ?? args.fingerprint),
    fingerprint: args.fingerprint,
    url:
      typeof args.normalized.url === "string"
        ? args.normalized.url
        : `https://quarantine.local/${args.source.slug}/${args.fingerprint}`,
    title:
      typeof args.normalized.title === "string" ? args.normalized.title : null,
    price:
      typeof args.normalized.price === "number" ? args.normalized.price : null,
    warmRent:
      typeof args.normalized.warmRent === "number"
        ? args.normalized.warmRent
        : null,
    area:
      typeof args.normalized.area === "number" ? args.normalized.area : null,
    rooms:
      typeof args.normalized.rooms === "number" ? args.normalized.rooms : null,
    city:
      typeof args.normalized.city === "string" ? args.normalized.city : null,
    bundesland:
      typeof args.normalized.bundesland === "string"
        ? args.normalized.bundesland
        : null,
    postalCode:
      typeof args.normalized.postalCode === "string"
        ? args.normalized.postalCode
        : null,
    attributes,
    status: "removed",
    raw: sanitizeJson(args.raw),
  };
}

function quarantineFingerprint(
  normalized: JsonObject,
  sourceSlug: string,
  raw: unknown,
): string {
  const fallbackExternalId = String(normalized.externalId ?? "").trim();
  if (fallbackExternalId.length > 0) {
    return computeFingerprint({
      sourceSlug,
      externalId: fallbackExternalId,
      url:
        typeof normalized.url === "string" && normalized.url.length > 0
          ? normalized.url
          : `https://quarantine.local/${sourceSlug}/${fallbackExternalId}`,
      price: typeof normalized.price === "number" ? normalized.price : 50,
      attributes: {},
      images: [],
      dealType: "rent",
    });
  }
  return computeFingerprint({
    sourceSlug,
    externalId: JSON.stringify(normalizeJson(raw)).slice(0, 200),
    url: `https://quarantine.local/${sourceSlug}/unknown`,
    price: 50,
    attributes: {},
    images: [],
    dealType: "rent",
  });
}

function diffListing(
  existing: ListingRecord,
  next: Omit<ListingRecord, "id">,
): Change[] {
  const changes: Change[] = [];
  for (const field of LISTING_FIELDS) {
    const oldValue =
      field === "attributes"
        ? withoutPendingMatchEvent(existing.attributes)
        : existing[field];
    const newValue =
      field === "attributes"
        ? withoutPendingMatchEvent(next.attributes)
        : next[field];
    const comparableOld =
      field === "price" ||
      field === "warmRent" ||
      field === "area" ||
      field === "rooms"
        ? toNumberOrNull(oldValue)
        : toNullable(oldValue);
    const comparableNew =
      field === "price" ||
      field === "warmRent" ||
      field === "area" ||
      field === "rooms"
        ? toNumberOrNull(newValue)
        : toNullable(newValue);
    if (!isSameValue(comparableOld, comparableNew)) {
      changes.push({ field, oldValue: comparableOld, newValue: comparableNew });
    }
  }
  return changes;
}

function diffListingGeo(
  existing: ListingRecord,
  nextGeo: GeoPoint | undefined,
): Change[] {
  if (isSameGeo(existing.geo, nextGeo)) return [];
  return [
    {
      field: "geo",
      oldValue: existing.geo ?? null,
      newValue: nextGeo ?? null,
    },
  ];
}

async function loadListingGeo(
  tx: PrismaLike,
  listingId: string,
): Promise<GeoPoint | undefined> {
  const rows = await tx.$queryRaw<
    Array<{ lat: number | string | null; lng: number | string | null }>
  >`
    SELECT ST_Y("geo"::geometry) AS lat, ST_X("geo"::geometry) AS lng
    FROM "listings"
    WHERE "id" = ${listingId}::uuid AND "geo" IS NOT NULL
    LIMIT 1
  `;
  const row = rows[0];
  const lat = toFiniteNumber(row?.lat);
  const lng = toFiniteNumber(row?.lng);
  return lat === undefined || lng === undefined ? undefined : { lat, lng };
}

async function persistListingGeo(
  tx: PrismaLike,
  listingId: string,
  geo: GeoPoint | undefined,
): Promise<void> {
  if (!geo) {
    await tx.$executeRaw`
      UPDATE "listings"
      SET "geo" = NULL
      WHERE "id" = ${listingId}::uuid
    `;
    return;
  }

  await tx.$executeRaw`
    UPDATE "listings"
    SET "geo" = ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography
    WHERE "id" = ${listingId}::uuid
  `;
}

function isQuarantined(listing: ListingRecord): boolean {
  return asObject(listing.attributes)._quarantine === true;
}

function isNumericDecrease(change: Change): boolean {
  const oldValue = toFiniteNumber(change.oldValue);
  const newValue = toFiniteNumber(change.newValue);
  return (
    oldValue !== undefined && newValue !== undefined && newValue < oldValue
  );
}

function isSignificantChange(change: Change): boolean {
  if (change.field === "price" || change.field === "warmRent") {
    return isNumericDecrease(change);
  }
  if (change.field === "attributes") {
    const oldAttributes = asObject(change.oldValue);
    const newAttributes = asObject(change.newValue);
    return [...MATCH_AFFECTING_ATTRIBUTE_KEYS].some(
      (key) =>
        !isSameValue(oldAttributes[key] ?? null, newAttributes[key] ?? null),
    );
  }
  return MATCH_AFFECTING_SIGNIFICANT_FIELDS.has(change.field);
}

function hasSignificantChanges(
  changes: Change[],
  existing: ListingRecord,
): boolean {
  return (
    changes.some((change) => isSignificantChange(change)) ||
    isQuarantined(existing)
  );
}

async function findExistingListing(
  tx: PrismaLike,
  sourceId: string,
  externalId: string,
  fingerprint: string,
): Promise<ListingRecord | null> {
  const byExternal = await tx.listing.findFirst({
    where: { sourceId, externalId },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (byExternal) {
    return lockAndReloadListing(tx, byExternal.id);
  }
  const byFingerprint = await tx.listing.findUnique({
    where: { fingerprint },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!byFingerprint) return null;
  return lockAndReloadListing(tx, byFingerprint.id);
}

async function lockAndReloadListing(
  tx: PrismaLike,
  listingId: string,
): Promise<ListingRecord | null> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "listings"
    WHERE "id" = ${listingId}::uuid
    FOR UPDATE
  `;
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!listing) return null;
  return {
    ...listing,
    geo: await loadListingGeo(tx, listing.id),
  };
}

async function saveImages(
  tx: PrismaLike,
  listingId: string,
  images: ListingImage[],
): Promise<void> {
  const rows = images.slice(0, 10).map((image, index) => ({
    listingId,
    url: image.url,
    position: index,
  }));
  if (rows.length === 0) return;
  await tx.listingImage.createMany({ data: rows });
}

async function enqueueMatch(
  matchQueue: MatchQueueLike,
  matchEvent: MatchEvent,
): Promise<void> {
  if (matchEvent.event === "changed" && !matchEvent.changeVersion) {
    throw new Error("changed match events require changeVersion");
  }
  const jobId = matchEvent.changeVersion
    ? `match-${matchEvent.listingId}-${safeJobIdPart(matchEvent.changeVersion)}`
    : `match-${matchEvent.listingId}-${matchEvent.event}`;
  await matchQueue.add(
    "match",
    {
      listingId: matchEvent.listingId,
      event: matchEvent.event,
      ...(matchEvent.changeVersion
        ? { changeVersion: matchEvent.changeVersion }
        : {}),
    },
    { ...MATCH_JOB_OPTIONS, jobId },
  );
}

function safeJobIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function createListing(args: {
  tx: PrismaLike;
  data: Omit<ListingRecord, "id">;
  geo?: GeoPoint;
  images: ListingImage[];
  quarantine: boolean;
  metrics: RunMetrics;
}): Promise<MatchEvent | undefined> {
  const matchEvent = args.quarantine ? undefined : "created";
  const data = matchEvent
    ? {
        ...args.data,
        attributes: withPendingMatchEvent(args.data.attributes, matchEvent),
      }
    : args.data;
  const listing = await args.tx.listing.create({ data });
  if (args.geo) await persistListingGeo(args.tx, listing.id, args.geo);
  await saveImages(args.tx, listing.id, args.images);
  args.metrics.newItems++;
  if (matchEvent) {
    return {
      listingId: listing.id,
      event: matchEvent,
      attributes: data.attributes,
    };
  }
  return undefined;
}

async function updateListing(args: {
  tx: PrismaLike;
  existing: ListingRecord;
  data: Omit<ListingRecord, "id">;
  geo?: GeoPoint;
  images: ListingImage[];
  quarantine: boolean;
  metrics: RunMetrics;
}): Promise<MatchEvent | undefined> {
  const changes = [
    ...diffListing(args.existing, args.data),
    ...diffListingGeo(args.existing, args.geo),
  ];
  const existingImages = imageSignature(args.existing.images ?? []);
  const nextImages = imageSignature(args.images);
  const imagesChanged = !isSameValue(existingImages, nextImages);
  const pendingEvent = pendingMatchEvent(args.existing);
  const shouldReactivate =
    !args.quarantine &&
    !isQuarantined(args.existing) &&
    (args.existing.status === "expired" || args.existing.status === "removed");
  const significant =
    !args.quarantine &&
    (shouldReactivate || hasSignificantChanges(changes, args.existing));
  const matchEvent =
    pendingEvent?.event === "created"
      ? "created"
      : significant
        ? "changed"
        : pendingEvent?.event;
  const changedAt = new Date();
  const changeVersion =
    matchEvent === "changed" && significant
      ? changedAt.toISOString()
      : pendingEvent?.changeVersion;

  if (changes.length === 0 && !imagesChanged && !shouldReactivate) {
    await args.tx.listing.update({
      where: { id: args.existing.id },
      data: { lastSeenAt: new Date() },
    });
    return pendingEvent;
  }

  const nextStatus = args.quarantine
    ? "removed"
    : significant
      ? "updated"
      : args.existing.status === "updated"
        ? "updated"
        : "active";
  const nextAttributes = matchEvent
    ? withPendingMatchEvent(args.data.attributes, matchEvent, changeVersion)
    : sanitizeJsonObject(args.data.attributes);
  await args.tx.listing.update({
    where: { id: args.existing.id },
    data: {
      ...args.data,
      attributes: nextAttributes,
      status: nextStatus,
      lastSeenAt: new Date(),
    },
  });
  if (!isSameGeo(args.existing.geo, args.geo)) {
    await persistListingGeo(args.tx, args.existing.id, args.geo);
  }

  const historyRows = changes.map((change) => ({
    listingId: args.existing.id,
    field: change.field,
    oldValue: sanitizeJson(change.oldValue),
    newValue: sanitizeJson(change.newValue),
    changedAt,
  }));

  if (nextStatus !== args.existing.status) {
    historyRows.push({
      listingId: args.existing.id,
      field: "status",
      oldValue: args.existing.status,
      newValue: nextStatus,
      changedAt,
    });
  }

  if (imagesChanged) {
    await args.tx.listingImage.deleteMany({
      where: { listingId: args.existing.id },
    });
    await saveImages(args.tx, args.existing.id, args.images);
    historyRows.push({
      listingId: args.existing.id,
      field: "images",
      oldValue: sanitizeJson(existingImages),
      newValue: sanitizeJson(nextImages),
      changedAt,
    });
  }

  if (historyRows.length > 0) {
    await args.tx.listingHistory.createMany({ data: historyRows });
  }

  args.metrics.updatedItems++;
  if (matchEvent) {
    return {
      listingId: args.existing.id,
      event: matchEvent,
      changeVersion,
      attributes: nextAttributes,
    };
  }
  return undefined;
}

async function clearPendingMatchEvent(
  prismaClient: PrismaLike,
  matchEvent: MatchEvent,
): Promise<void> {
  await prismaClient.$executeRaw`
    UPDATE "listings"
    SET "attributes" = "attributes" - ${PENDING_MATCH_EVENT_KEY} - ${PENDING_MATCH_CHANGE_VERSION_KEY}
    WHERE "id" = ${matchEvent.listingId}::uuid
      AND COALESCE("attributes"->>${PENDING_MATCH_EVENT_KEY}, '') = ${matchEvent.event}
      AND COALESCE("attributes"->>${PENDING_MATCH_CHANGE_VERSION_KEY}, '') = ${matchEvent.changeVersion ?? ""}
  `;
}

async function persistValidListing(args: {
  tx: PrismaLike;
  source: SourceRecord;
  raw: unknown;
  listing: NormalizedListing;
  metrics: RunMetrics;
}): Promise<MatchEvent | undefined> {
  const fingerprint = computeFingerprint(args.listing);
  const data = normalizeListingData(
    args.listing,
    fingerprint,
    args.source.id,
    args.raw,
  );
  const existing = await findExistingListing(
    args.tx,
    args.source.id,
    args.listing.externalId,
    fingerprint,
  );
  if (!existing) {
    return createListing({
      tx: args.tx,
      data,
      geo: args.listing.geo,
      images: args.listing.images,
      quarantine: false,
      metrics: args.metrics,
    });
  }
  return updateListing({
    tx: args.tx,
    existing,
    data,
    geo: args.listing.geo ?? existing.geo ?? undefined,
    images: args.listing.images,
    quarantine: false,
    metrics: args.metrics,
  });
}

async function persistQuarantine(args: {
  tx: PrismaLike;
  source: SourceRecord;
  raw: unknown;
  normalized: JsonObject;
  issues: string[];
  metrics: RunMetrics;
}): Promise<MatchEvent | undefined> {
  const fingerprint = quarantineFingerprint(
    args.normalized,
    args.source.slug,
    args.raw,
  );
  const data = quarantineListingData({
    normalized: args.normalized,
    source: args.source,
    raw: args.raw,
    fingerprint,
    issues: args.issues,
  });
  const existing = await findExistingListing(
    args.tx,
    args.source.id,
    data.externalId,
    fingerprint,
  );
  if (!existing) {
    return createListing({
      tx: args.tx,
      data,
      images: [],
      quarantine: true,
      metrics: args.metrics,
    });
  }
  return updateListing({
    tx: args.tx,
    existing,
    data,
    images: [],
    quarantine: true,
    metrics: args.metrics,
  });
}

function statusFromHealth(status: HealthStatus): string {
  return status.detail
    ? `Connector healthCheck failed: ${status.detail}`
    : "Connector healthCheck failed";
}

async function finishRun(
  prismaClient: PrismaLike,
  runId: string,
  status: "success" | "partial" | "failed",
  metrics: RunMetrics,
  sourceSlug: string,
): Promise<void> {
  await prismaClient.sourceRun.update({
    where: { id: runId },
    data: {
      status,
      itemsFetched: metrics.fetched,
      itemsNew: metrics.newItems,
      itemsUpdated: metrics.updatedItems,
      errors: metrics.errors,
      finishedAt: new Date(),
    },
  });

  // Never let a metrics failure bubble into the job. Best-effort observability.
  try {
    recordSourceRunOutcome({
      source: sourceSlug,
      status,
      errors: metrics.errors,
      itemsNew: metrics.newItems,
    });
  } catch (err) {
    console.error(
      `[collect] ${sourceSlug}: failed to record run metrics: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export async function runCollectJob(
  job: CollectJob,
  deps: CollectDeps,
): Promise<void> {
  const { sourceSlug } = job.data;
  const source = await deps.prisma.source.findUnique({
    where: { slug: sourceSlug },
    include: { credentials: true },
  });
  if (!source || !source.isActive) {
    console.log(
      `[collect] Source ${sourceSlug} not found or inactive, skipping.`,
    );
    return;
  }

  const connector = deps.connectors.get(sourceSlug);
  if (!connector) {
    console.warn(
      `[collect] Source ${sourceSlug} has no registered connector, skipping.`,
    );
    return;
  }

  const activation = getSourceActivationDecision({
    sourceSlug,
    config: source.config,
    isRegistered: true,
  });
  if (!activation.activatable) {
    console.warn(
      `[collect] Source ${sourceSlug} is not activation-approved, skipping: ${activation.reasons.join("; ")}`,
    );
    return;
  }

  const run = await deps.prisma.sourceRun.create({
    data: { sourceId: source.id, status: "running" },
  });
  const metrics: RunMetrics = {
    fetched: 0,
    newItems: 0,
    updatedItems: 0,
    errors: 0,
  };
  const abortController = new AbortController();
  let ctx: ConnectorContext | undefined;

  // Profile-driven sources derive their crawl areas from active search
  // profiles (location + radius + max price) instead of a fixed config city.
  let effectiveSource = source;
  const baseConfig = asObject(source.config);
  if (baseConfig.profileDriven === true && deps.loadProfilesForAreas) {
    try {
      const profiles = await deps.loadProfilesForAreas();
      const maxAreas =
        typeof baseConfig.maxAreas === "number" ? baseConfig.maxAreas : 10;
      const areas = deriveKleinanzeigenSearchAreas(profiles, maxAreas);
      if (areas.length > 0) {
        effectiveSource = {
          ...source,
          config: { ...baseConfig, searchAreas: areas },
        };
        console.log(
          `[collect] ${sourceSlug}: profile-driven areas: ${areas
            .map((a) => a.location)
            .join(", ")}`,
        );
      } else {
        console.log(
          `[collect] ${sourceSlug}: profile-driven enabled but no profile-derived areas; using base config`,
        );
      }
    } catch (err) {
      console.warn(
        `[collect] ${sourceSlug}: failed to derive profile areas: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  try {
    ctx = await buildConnectorContext(
      effectiveSource,
      abortController.signal,
      deps.decryptCredential,
    );
    const health = await connector.healthCheck(ctx);
    if (!health.healthy) {
      throw new Error(statusFromHealth(health));
    }

    const maxItems =
      typeof ctx.config.itemsPerRun === "number" ? ctx.config.itemsPerRun : 25;
    const iterable = connector.fetch(ctx, {
      cursor: job.data.cursor,
      maxItems,
    });

    for await (const raw of iterable) {
      metrics.fetched++;
      try {
        let mapped: unknown;
        try {
          mapped = connector.map(raw);
        } catch (err) {
          metrics.errors++;
          const issue = `map failed: ${err instanceof Error ? err.message : String(err)}`;
          await deps.prisma.$transaction((tx) =>
            persistQuarantine({
              tx,
              source,
              raw,
              normalized: asObject(raw),
              issues: [issue],
              metrics,
            }),
          );
          continue;
        }

        const normalized = asObject(mapped);
        const quality = runQualityGate(mapped);
        const matchEvent = await deps.prisma.$transaction(async (tx) => {
          if (!quality.ok || !quality.listing) {
            metrics.errors++;
            return persistQuarantine({
              tx,
              source,
              raw,
              normalized,
              issues: quality.issues,
              metrics,
            });
          }
          return persistValidListing({
            tx,
            source,
            raw,
            listing: quality.listing,
            metrics,
          });
        });
        if (matchEvent) {
          await enqueueMatch(deps.matchQueue, matchEvent);
          await clearPendingMatchEvent(deps.prisma, matchEvent);
        }
      } catch (err) {
        metrics.errors++;
        ctx?.logger.error("Failed to process listing", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await finishRun(
      deps.prisma,
      run.id,
      metrics.errors > 0 ? "partial" : "success",
      metrics,
      sourceSlug,
    );
  } catch (err) {
    metrics.errors++;
    await finishRun(deps.prisma, run.id, "failed", metrics, sourceSlug);
    throw err;
  } finally {
    abortController.abort();
  }
}

export function startCollectWorker(): Worker {
  const registry = createDefaultConnectorRegistry();
  const connection = createRedisConnection();
  const matchQueue = new Queue("match", { connection });
  const prismaClient = prisma as unknown as {
    searchProfile: {
      findMany: (args: unknown) => Promise<
        Array<{
          filters: Array<{
            operator: string;
            value: unknown;
            definition: { key: string };
          }>;
        }>
      >;
    };
  };
  const loadProfilesForAreas = async (): Promise<ProfileForAreas[]> => {
    const rows = await prismaClient.searchProfile.findMany({
      where: { isActive: true },
      include: { filters: { include: { definition: true } } },
    });
    return rows.map((p) => ({
      filters: p.filters.map((f) => ({
        key: f.definition.key,
        operator: f.operator,
        value: f.value,
      })),
    }));
  };
  const worker = new Worker(
    "collect",
    async (job) =>
      runCollectJob(job, {
        prisma: prisma as unknown as PrismaLike,
        matchQueue,
        connectors: registry,
        loadProfilesForAreas,
      }),
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => console.log(`[collect] completed ${job.id}`));
  worker.on("failed", (job, err) =>
    console.error(`[collect] failed ${job?.id}`, err),
  );

  console.log("[collect] Worker started");
  return worker;
}

if (require.main === module) {
  startMetricsServer();
  startCollectWorker();
}
