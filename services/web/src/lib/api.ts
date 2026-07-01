const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
const ACCESS_TOKEN_KEY = "auth_token";
const LEGACY_REFRESH_TOKEN_KEY = "auth_refresh_token";

type AuthFailureHandler = () => void;

let authFailureHandler: AuthFailureHandler | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;
let accessTokenMemory: string | null = null;

export function setAuthFailureHandler(
  handler: AuthFailureHandler | null,
): void {
  authFailureHandler = handler;
}

function getToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? accessTokenMemory;
  } catch {
    return accessTokenMemory;
  }
}

export function getStoredAccessToken(): string | null {
  return getToken();
}

export function storeAuthSession(session: AuthResponse): void {
  accessTokenMemory = session.access_token;
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
    localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    // Browser storage may be unavailable; API calls can still rely on cookies.
  }
}

export function clearAuthSession(): void {
  accessTokenMemory = null;
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    // ignore unavailable storage
  }
}

class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  requestId?: string;

  constructor(
    message: string,
    status: number,
    meta: { code?: string; details?: unknown; requestId?: string } = {},
  ) {
    super(message);
    this.status = status;
    this.code = meta.code;
    this.details = meta.details;
    this.requestId = meta.requestId;
    this.name = "ApiError";
  }
}

function parseErrorBody(body: Record<string, unknown>, status: number) {
  const fallback = `Request failed with status ${status}`;
  const error = body.error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : fallback,
      code: typeof e.code === "string" ? e.code : undefined,
      details: e.details,
      requestId: typeof e.request_id === "string" ? e.request_id : undefined,
    };
  }

  if (typeof body.message === "string") {
    return { message: body.message };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: fallback };
}

interface RequestOptions {
  retryOnUnauthorized?: boolean;
  includeAuth?: boolean;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requestOptions: RequestOptions = {},
): Promise<T> {
  const retryOnUnauthorized = requestOptions.retryOnUnauthorized ?? true;
  const includeAuth = requestOptions.includeAuth ?? true;
  const token = includeAuth ? getToken() : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && retryOnUnauthorized && token) {
      try {
        await refreshStoredSession();
      } catch (error) {
        clearAuthSession();
        authFailureHandler?.();
        throw error;
      }

      try {
        return await request<T>(path, options, { retryOnUnauthorized: false });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearAuthSession();
          authFailureHandler?.();
        }
        throw error;
      }
    }

    const body = (await res.json().catch(() => ({
      message: `Request failed with status ${res.status}`,
    }))) as Record<string, unknown>;
    const parsed = parseErrorBody(body, res.status);
    throw new ApiError(parsed.message, res.status, parsed);
  }

  const json = (await res.json()) as { data?: T } | T;
  // Unwrap { data: ... } envelope if present
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

async function refreshStoredSession(): Promise<AuthResponse> {
  refreshPromise ??= request<AuthResponse>(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    { retryOnUnauthorized: false, includeAuth: false },
  )
    .then((session) => {
      storeAuthSession(session);
      return session;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  user?: User;
}

export interface RegisterResponse {
  id: string;
}

export interface RefreshPayload {
  refresh_token?: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export interface SearchProfile {
  id: string;
  name: string;
  isActive: boolean;
  notify: boolean;
  auto_reply_enabled: boolean;
  auto_reply_text: string | null;
  criteria: Record<string, unknown>;
  attrs: Record<string, unknown>;
  filterValues: ProfileFilterFormValues;
  city: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  price_min: number | null;
  price_max: number | null;
  area_min: number | null;
  area_max: number | null;
  rooms_min: number | null;
  balcony: boolean;
  elevator: boolean;
  parking: boolean;
  pets: boolean;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export type FilterDataType =
  | "number"
  | "bool"
  | "enum"
  | "text"
  | "range"
  | "geo";
export type FilterOperator = "gte" | "lte" | "eq" | "in" | "within";

export interface FilterDefinition {
  id?: string;
  key: string;
  label: Record<string, string>;
  data_type: FilterDataType;
  operator_set: FilterOperator[];
  config: Record<string, unknown>;
  is_active: boolean;
}

export type ProfileFilterFormValues = Record<string, unknown>;

export interface FilterInput {
  key: string;
  operator: string;
  value?: unknown;
}

export interface CreateProfilePayload extends ProfileFilterFormValues {
  name: string;
  notify?: boolean;
  auto_reply_enabled?: boolean;
  auto_reply_text?: string | null;
  filters?: FilterInput[];
  filterDefinitions?: FilterDefinition[];
  filter_definitions?: FilterDefinition[];
}

export interface UpdateProfilePayload extends Partial<CreateProfilePayload> {
  is_active?: boolean;
}

const FILTER_DATA_TYPES = new Set<FilterDataType>([
  "number",
  "bool",
  "enum",
  "text",
  "range",
  "geo",
]);
const FILTER_OPERATORS = new Set<FilterOperator>([
  "gte",
  "lte",
  "eq",
  "in",
  "within",
]);

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(value);
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([key, val]) => [key, val]),
  );
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toFilterDataType(value: unknown): FilterDataType {
  return typeof value === "string" &&
    FILTER_DATA_TYPES.has(value as FilterDataType)
    ? (value as FilterDataType)
    : "text";
}

function toFilterOperators(value: unknown): FilterOperator[] {
  return toStringArray(value).filter((item): item is FilterOperator =>
    FILTER_OPERATORS.has(item as FilterOperator),
  );
}

export function normalizeFilterDefinition(
  raw: Record<string, unknown>,
): FilterDefinition {
  const key = String(raw.key ?? "");
  return {
    id: raw.id == null ? undefined : String(raw.id),
    key,
    label: toStringRecord(raw.label),
    data_type: toFilterDataType(raw.data_type ?? raw.dataType),
    operator_set: toFilterOperators(raw.operator_set ?? raw.operatorSet),
    config: toRecord(raw.config),
    is_active: toBool(raw.is_active ?? raw.isActive ?? true),
  };
}

export function getFilterLabel(def: FilterDefinition, locale = "de"): string {
  return def.label[locale] ?? def.label.de ?? def.label.en ?? def.key;
}

function isBlank(value: unknown): boolean {
  return value == null || value === "";
}

function parseNumber(value: unknown, field: string): number | undefined {
  if (isBlank(value)) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${field}: invalid number`);
  }
  return n;
}

function parseNumberArray(value: unknown, field: string): number[] | undefined {
  if (isBlank(value)) return undefined;
  const values = Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  if (values.length === 0) return undefined;
  return values.map((item) => {
    const n = parseNumber(item, field);
    if (n == null) throw new Error(`${field}: invalid number`);
    return n;
  });
}

function parseStringValue(value: unknown): string | undefined {
  if (isBlank(value)) return undefined;
  return String(value).trim();
}

function parseStringArray(value: unknown): string[] | undefined {
  if (isBlank(value)) return undefined;
  const values = Array.isArray(value)
    ? value.map(String)
    : String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function readValidation(def: FilterDefinition): Record<string, unknown> {
  const validation = toRecord(def.config.validation);
  return Object.keys(validation).length > 0 ? validation : def.config;
}

function assertConfiguredNumber(def: FilterDefinition, value: number): void {
  const validation = readValidation(def);
  const min = parseNumber(validation.min ?? validation.minValue, def.key);
  const max = parseNumber(validation.max ?? validation.maxValue, def.key);
  if (min != null && value < min) {
    throw new Error(`${def.key}: must be >= ${min}`);
  }
  if (max != null && value > max) {
    throw new Error(`${def.key}: must be <= ${max}`);
  }
}

function hasOperator(def: FilterDefinition, operator: FilterOperator): boolean {
  return def.operator_set.includes(operator);
}

function buildNumericFilters(
  values: ProfileFilterFormValues,
  def: FilterDefinition,
): FilterInput[] {
  const filters: FilterInput[] = [];
  const min = hasOperator(def, "gte")
    ? parseNumber(values[`${def.key}_min`] ?? values[`${def.key}_gte`], def.key)
    : undefined;
  const max = hasOperator(def, "lte")
    ? parseNumber(values[`${def.key}_max`] ?? values[`${def.key}_lte`], def.key)
    : undefined;

  if (min != null) assertConfiguredNumber(def, min);
  if (max != null) assertConfiguredNumber(def, max);
  if (min != null && max != null && min > max) {
    throw new Error(`${def.key}: min must be <= max`);
  }
  if (min != null) filters.push({ key: def.key, operator: "gte", value: min });
  if (max != null) filters.push({ key: def.key, operator: "lte", value: max });

  if (hasOperator(def, "eq")) {
    const eq = parseNumber(values[def.key] ?? values[`${def.key}_eq`], def.key);
    if (eq != null) {
      assertConfiguredNumber(def, eq);
      filters.push({ key: def.key, operator: "eq", value: eq });
    }
  }

  if (hasOperator(def, "in")) {
    const inValues = parseNumberArray(values[`${def.key}_in`], def.key);
    if (inValues)
      filters.push({ key: def.key, operator: "in", value: inValues });
  }

  return filters;
}

function buildTextFilters(
  values: ProfileFilterFormValues,
  def: FilterDefinition,
): FilterInput[] {
  if (hasOperator(def, "eq")) {
    const value = parseStringValue(values[def.key] ?? values[`${def.key}_eq`]);
    return value == null ? [] : [{ key: def.key, operator: "eq", value }];
  }

  if (hasOperator(def, "in")) {
    const value = parseStringArray(values[def.key] ?? values[`${def.key}_in`]);
    return value == null ? [] : [{ key: def.key, operator: "in", value }];
  }

  return [];
}

function buildGeoFilters(
  values: ProfileFilterFormValues,
  def: FilterDefinition,
): FilterInput[] {
  if (!hasOperator(def, "within")) return [];
  const lat = parseNumber(values.lat ?? values[`${def.key}_lat`], def.key);
  const lng = parseNumber(values.lng ?? values[`${def.key}_lng`], def.key);
  const radiusKm = parseNumber(
    values.radius_km ?? values[`${def.key}_radius_km`],
    def.key,
  );
  if (lat == null && lng == null && radiusKm == null) return [];
  if (lat == null || lng == null || radiusKm == null) {
    return [];
  }
  if (radiusKm <= 0) {
    throw new Error(`${def.key}: radius_km must be > 0`);
  }
  return [
    {
      key: def.key,
      operator: "within",
      value: { lat, lng, radius_km: radiusKm },
    },
  ];
}

export function buildFilters(
  values: ProfileFilterFormValues,
  definitions: readonly FilterDefinition[],
): FilterInput[] {
  const filters: FilterInput[] = [];
  for (const def of definitions) {
    if (!def.is_active || !def.key || def.operator_set.length === 0) continue;
    if (def.data_type === "number" || def.data_type === "range") {
      filters.push(...buildNumericFilters(values, def));
    } else if (def.data_type === "text" || def.data_type === "enum") {
      filters.push(...buildTextFilters(values, def));
    } else if (def.data_type === "geo") {
      filters.push(...buildGeoFilters(values, def));
    } else if (
      def.data_type === "bool" &&
      hasOperator(def, "eq") &&
      values[def.key] === true
    ) {
      filters.push({ key: def.key, operator: "eq", value: true });
    }
  }
  return filters;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toBool(v: unknown): boolean {
  return v === true || v === "true";
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function hasProfileFilterInput(payload: UpdateProfilePayload): boolean {
  if (Array.isArray(payload.filters)) return true;
  const defs = payload.filterDefinitions ?? payload.filter_definitions;
  if (!Array.isArray(defs) || defs.length === 0) return false;
  return Object.keys(payload).some(
    (key) =>
      ![
        "name",
        "notify",
        "auto_reply_enabled",
        "auto_reply_text",
        "is_active",
        "filters",
        "filterDefinitions",
        "filter_definitions",
      ].includes(key) && hasOwn(payload as Record<string, unknown>, key),
  );
}

function buildProfileBody(
  payload: UpdateProfilePayload,
  includeFilters: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.notify !== undefined) body.notify = payload.notify;
  if (payload.auto_reply_enabled !== undefined) {
    const enabled = payload.auto_reply_enabled;
    const text =
      typeof payload.auto_reply_text === "string"
        ? payload.auto_reply_text.trim()
        : "";
    body.auto_reply_enabled = enabled;
    body.auto_reply_text = enabled && text !== "" ? text : null;
  }
  if (payload.is_active !== undefined) body.is_active = payload.is_active;
  if (Array.isArray(payload.filters)) {
    body.filters = payload.filters;
  } else if (includeFilters || hasProfileFilterInput(payload)) {
    const defs = payload.filterDefinitions ?? payload.filter_definitions ?? [];
    body.filters = buildFilters(payload, defs);
  }
  return body;
}

function mapCriteriaValues(
  criteria: Record<string, unknown>,
): ProfileFilterFormValues {
  const values: ProfileFilterFormValues = {};
  for (const [key, value] of Object.entries(criteria)) {
    if (key === "attrs") {
      Object.assign(values, toRecord(value));
      continue;
    }

    if (key === "location") {
      const location = toRecord(value);
      const lat = toNum(location.lat);
      const lng = toNum(location.lng);
      const radiusKm = toNum(location.radius_km ?? location.radiusKm);
      if (lat != null) values.lat = lat;
      if (lng != null) values.lng = lng;
      if (radiusKm != null) values.radius_km = radiusKm;
      continue;
    }

    const bucket = toRecord(value);
    if (Object.keys(bucket).length > 0) {
      if (bucket.gte != null)
        values[`${key}_min`] = toNum(bucket.gte) ?? bucket.gte;
      if (bucket.lte != null)
        values[`${key}_max`] = toNum(bucket.lte) ?? bucket.lte;
      if (bucket.eq != null) values[key] = bucket.eq;
      if (bucket.in != null) values[key] = bucket.in;
      continue;
    }

    values[key] = value;
  }
  return values;
}

export function mapProfile(raw: Record<string, unknown>): SearchProfile {
  const criteria = (raw.criteria ?? {}) as Record<string, unknown>;
  const locationData = criteria.location as Record<string, unknown> | undefined;
  const priceObj = criteria.price as Record<string, unknown> | undefined;
  const areaObj = criteria.area as Record<string, unknown> | undefined;
  const roomsObj = criteria.rooms as Record<string, unknown> | undefined;
  const attrs = (criteria.attrs ?? {}) as Record<string, unknown>;
  const isActive = toBool(raw.is_active ?? raw.isActive);
  const lat = toNum(locationData?.lat);
  const lng = toNum(locationData?.lng);
  const radiusKm =
    locationData?.radius_km != null
      ? toNum(locationData.radius_km)
      : locationData?.radiusKm != null
        ? toNum(locationData.radiusKm)
        : null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    isActive,
    notify: toBool(raw.notify),
    auto_reply_enabled: toBool(raw.auto_reply_enabled ?? raw.autoReplyEnabled),
    auto_reply_text:
      raw.auto_reply_text == null && raw.autoReplyText == null
        ? null
        : String(raw.auto_reply_text ?? raw.autoReplyText),
    criteria,
    attrs,
    filterValues: mapCriteriaValues(criteria),
    city: String(criteria.city ?? ""),
    postal_code: String(
      criteria.postal_code ??
        criteria.postalCode ??
        locationData?.postal_code ??
        locationData?.postalCode ??
        "",
    ),
    lat,
    lng,
    radius_km: radiusKm,
    price_min: priceObj?.gte != null ? toNum(priceObj.gte) : null,
    price_max: priceObj?.lte != null ? toNum(priceObj.lte) : null,
    area_min: areaObj?.gte != null ? toNum(areaObj.gte) : null,
    area_max: areaObj?.lte != null ? toNum(areaObj.lte) : null,
    rooms_min: roomsObj?.gte != null ? toNum(roomsObj.gte) : null,
    balcony: toBool(attrs.balcony ?? criteria.balcony),
    elevator: toBool(attrs.elevator ?? criteria.elevator),
    parking: toBool(attrs.parking ?? criteria.parking),
    pets: toBool(attrs.pets_allowed ?? criteria.pets_allowed),
    status: isActive ? "active" : "suspended",
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
    updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ""),
  };
}

export interface Match {
  id: string;
  profileId: string;
  listingId: string;
  matchedAt: string;
  state: string;
  listing?: {
    id: string;
    title: string;
    url: string;
    price: string;
    city: string;
  };
}

function mapMatch(raw: Record<string, unknown>): Match {
  const listingRaw = raw.listing as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    profileId: String(raw.profile_id ?? raw.profileId ?? ""),
    listingId: String(raw.listing_id ?? raw.listingId ?? ""),
    matchedAt: String(raw.matched_at ?? raw.matchedAt ?? ""),
    state: String(raw.state ?? ""),
    listing: listingRaw
      ? {
          id: String(listingRaw.id ?? ""),
          title: String(listingRaw.title ?? ""),
          url: String(listingRaw.url ?? ""),
          price: listingRaw.price == null ? "" : String(listingRaw.price),
          city: String(listingRaw.city ?? ""),
        }
      : undefined,
  };
}

export interface TelegramLinkResponse {
  link: string;
  connected: boolean;
}

export interface AdminStats {
  users: number;
  listings: number;
  matches: number;
  notifications: number;
}

export interface AdminSource {
  id: string;
  slug?: string;
  name: string;
  enabled: boolean;
  is_active: boolean;
  breakerState: string;
  lifecycleStatus: string | null;
  health: "healthy" | "degraded" | "failing" | "paused" | "unknown";
  listings_count: number;
  lastRunStatus: string | null;
  itemsFetched: number;
  itemsNew: number;
  itemsUpdated: number;
  errors: number;
  lastRun: AdminSourceRun | null;
}

export interface AdminSourceRun {
  id: string;
  sourceId: string;
  status: string;
  itemsFetched: number;
  itemsNew: number;
  itemsUpdated: number;
  errors: number;
  startedAt: string;
  finishedAt: string | null;
}

function toAdminSourceHealth(value: unknown): AdminSource["health"] {
  return value === "healthy" ||
    value === "degraded" ||
    value === "failing" ||
    value === "paused" ||
    value === "unknown"
    ? value
    : "unknown";
}

function mapAdminSourceRun(raw: Record<string, unknown>): AdminSourceRun {
  return {
    id: String(raw.id ?? ""),
    sourceId: String(raw.source_id ?? raw.sourceId ?? ""),
    status: String(raw.status ?? ""),
    itemsFetched: toNum(raw.items_fetched ?? raw.itemsFetched) ?? 0,
    itemsNew: toNum(raw.items_new ?? raw.itemsNew) ?? 0,
    itemsUpdated: toNum(raw.items_updated ?? raw.itemsUpdated) ?? 0,
    errors: toNum(raw.errors) ?? 0,
    startedAt: String(raw.started_at ?? raw.startedAt ?? ""),
    finishedAt:
      raw.finished_at == null && raw.finishedAt == null
        ? null
        : String(raw.finished_at ?? raw.finishedAt),
  };
}

function mapAdminSource(raw: Record<string, unknown>): AdminSource {
  const isActive = toBool(raw.is_active ?? raw.isActive ?? raw.enabled);
  const lastRunRaw = raw.last_run ?? raw.lastRun;
  const lastRun =
    lastRunRaw && typeof lastRunRaw === "object"
      ? mapAdminSourceRun(lastRunRaw as Record<string, unknown>)
      : null;
  return {
    id: String(raw.id ?? ""),
    slug: raw.slug == null ? undefined : String(raw.slug),
    name: String(raw.name ?? raw.slug ?? ""),
    enabled: isActive,
    is_active: isActive,
    breakerState: String(raw.breaker_state ?? raw.breakerState ?? "closed"),
    lifecycleStatus:
      raw.lifecycle_status == null && raw.lifecycleStatus == null
        ? null
        : String(raw.lifecycle_status ?? raw.lifecycleStatus),
    health: toAdminSourceHealth(raw.health),
    listings_count: toNum(raw.listings_count) ?? 0,
    lastRunStatus:
      raw.last_run_status == null && raw.lastRunStatus == null
        ? (lastRun?.status ?? null)
        : String(raw.last_run_status ?? raw.lastRunStatus),
    itemsFetched:
      toNum(raw.items_fetched ?? raw.itemsFetched) ??
      lastRun?.itemsFetched ??
      0,
    itemsNew: toNum(raw.items_new ?? raw.itemsNew) ?? lastRun?.itemsNew ?? 0,
    itemsUpdated:
      toNum(raw.items_updated ?? raw.itemsUpdated) ??
      lastRun?.itemsUpdated ??
      0,
    errors: toNum(raw.errors) ?? lastRun?.errors ?? 0,
    lastRun,
  };
}

export interface AdminQueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  depth: number;
}

export interface AdminQueueStatus {
  collect: AdminQueueCounts;
  match: AdminQueueCounts;
  notify: AdminQueueCounts;
  telegram: AdminQueueCounts;
}

function mapAdminQueueCounts(raw: unknown): AdminQueueCounts {
  const counts = toRecord(raw);
  const waiting = toNum(counts.waiting) ?? 0;
  const active = toNum(counts.active) ?? 0;
  const delayed = toNum(counts.delayed) ?? 0;
  return {
    waiting,
    active,
    delayed,
    failed: toNum(counts.failed) ?? 0,
    completed: toNum(counts.completed) ?? 0,
    depth: toNum(counts.depth) ?? waiting,
  };
}

function mapAdminQueueStatus(raw: Record<string, unknown>): AdminQueueStatus {
  return {
    collect: mapAdminQueueCounts(raw.collect),
    match: mapAdminQueueCounts(raw.match),
    notify: mapAdminQueueCounts(raw.notify),
    telegram: mapAdminQueueCounts(raw.telegram),
  };
}

export interface AdminAuditLog {
  id: string;
  action: string;
  actorId: string | null;
  userEmail: string | null;
  meta: Record<string, unknown>;
  details: string;
  createdAt: string;
}

function stringifyDetails(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mapAdminAuditLog(raw: Record<string, unknown>): AdminAuditLog {
  const meta = toRecord(raw.meta);
  const actor = toRecord(raw.actor);
  return {
    id: String(raw.id ?? ""),
    actorId:
      raw.actor_id == null && raw.actorId == null
        ? null
        : String(raw.actor_id ?? raw.actorId),
    userEmail:
      raw.user_email == null && raw.userEmail == null && actor.email == null
        ? null
        : String(raw.user_email ?? raw.userEmail ?? actor.email),
    action: String(raw.action ?? ""),
    meta,
    details: stringifyDetails(raw.details ?? meta),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}

export const api = {
  login: (payload: LoginPayload) =>
    request<AuthResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { retryOnUnauthorized: false, includeAuth: false },
    ),

  register: (payload: RegisterPayload) =>
    request<RegisterResponse>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { retryOnUnauthorized: false, includeAuth: false },
    ),

  refresh: (payload: RefreshPayload = {}) =>
    request<AuthResponse>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { retryOnUnauthorized: false, includeAuth: false },
    ),

  logout: (payload: RefreshPayload = {}) =>
    request<{ ok: true }>(
      "/auth/logout",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { retryOnUnauthorized: false, includeAuth: false },
    ),

  getMe: () => request<User>("/me"),

  getFilterDefinitions: async (): Promise<FilterDefinition[]> => {
    const data = await request<Record<string, unknown>[]>("/filters");
    return (data ?? [])
      .map(normalizeFilterDefinition)
      .filter((def) => def.is_active);
  },

  getProfiles: async (): Promise<SearchProfile[]> => {
    const data = await request<Record<string, unknown>[]>("/profiles");
    return (data ?? []).map(mapProfile);
  },

  createProfile: async (payload: CreateProfilePayload) => {
    const body = buildProfileBody(
      { ...payload, notify: payload.notify ?? true },
      true,
    );
    const data = await request<Record<string, unknown>>("/profiles", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapProfile(data);
  },

  updateProfile: async (id: string, payload: UpdateProfilePayload) => {
    const body = buildProfileBody(payload, false);
    const data = await request<Record<string, unknown>>(`/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return mapProfile(data);
  },

  deleteProfile: (id: string) =>
    request<void>(`/profiles/${id}`, { method: "DELETE" }),

  getMatches: async (profileId?: string) => {
    if (!profileId) return [];
    const data = await request<Record<string, unknown>[]>(
      `/profiles/${profileId}/matches`,
    );
    return (data ?? []).map(mapMatch);
  },

  getTelegramLink: async (): Promise<TelegramLinkResponse> => {
    try {
      const data = await request<{
        url?: string;
        token?: string;
        connected?: boolean;
      }>("/auth/telegram/link", { method: "POST" });
      return { link: data?.url ?? "", connected: data?.connected ?? false };
    } catch {
      return { link: "", connected: false };
    }
  },

  getAdminStats: () => request<AdminStats>("/admin/stats"),

  getAdminSources: async () => {
    const data = await request<Record<string, unknown>[]>("/admin/sources");
    return (data ?? []).map(mapAdminSource);
  },

  getSourceRuns: async (sourceId: string): Promise<AdminSourceRun[]> => {
    const data = await request<Record<string, unknown>[]>(
      `/admin/sources/${sourceId}/runs`,
    );
    return (data ?? []).map(mapAdminSourceRun);
  },

  toggleSource: async (id: string, _enabled: boolean) => {
    const data = await request<Record<string, unknown>>(
      `/admin/sources/${id}/toggle`,
      {
        method: "POST",
      },
    );
    return mapAdminSource(data);
  },

  getQueueStatus: async () => {
    const data = await request<Record<string, unknown>>("/admin/queues");
    return mapAdminQueueStatus(data ?? {});
  },

  getAuditLogs: async () => {
    // Explicit page size. NOTE: the deployed /admin/logs currently returns 400
    // ("limit: expected string, received number") regardless of this param — a
    // backend query-validation bug (filed as a blocker). The admin page tolerates
    // this failure (independent section loading) so the rest of the panel works.
    const data = await request<Record<string, unknown>[]>(
      "/admin/logs?limit=50",
    );
    return (data ?? []).map(mapAdminAuditLog);
  },
};

export { ApiError };
