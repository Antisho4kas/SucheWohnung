const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

function getToken(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `Request failed with status ${res.status}` })) as Record<string, unknown>;
    throw new ApiError(
      String(body.message ?? body.error ?? `Request failed with status ${res.status}`),
      res.status,
    );
  }

  const json = await res.json() as { data?: T } | T;
  // Unwrap { data: ... } envelope if present
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
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
  token: string;
  user: User;
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
  criteria: Record<string, unknown>;
  city: string;
  postal_code: string;
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

export interface CreateProfilePayload {
  name: string;
  city?: string;
  postal_code?: string;
  radius_km?: number;
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  rooms_min?: number;
  balcony?: boolean;
  elevator?: boolean;
  parking?: boolean;
  pets?: boolean;
  notify?: boolean;
}

interface FilterInput {
  key: string;
  operator: string;
  value?: unknown;
}

function buildFilters(payload: CreateProfilePayload): FilterInput[] {
  const filters: FilterInput[] = [];
  if (payload.city) filters.push({ key: "city", operator: "eq", value: payload.city });
  if (payload.postal_code) filters.push({ key: "postal_code", operator: "eq", value: payload.postal_code });
  if (payload.radius_km && payload.radius_km > 0 && (payload.city || payload.postal_code)) {
    filters.push({ key: "location", operator: "within", value: { city: payload.city, postalCode: payload.postal_code, radiusKm: payload.radius_km } });
  }
  if (payload.price_min != null) filters.push({ key: "price", operator: "gte", value: payload.price_min });
  if (payload.price_max != null) filters.push({ key: "price", operator: "lte", value: payload.price_max });
  if (payload.area_min != null) filters.push({ key: "area", operator: "gte", value: payload.area_min });
  if (payload.area_max != null) filters.push({ key: "area", operator: "lte", value: payload.area_max });
  if (payload.rooms_min != null) filters.push({ key: "rooms", operator: "gte", value: payload.rooms_min });
  if (payload.balcony) filters.push({ key: "balcony", operator: "eq", value: true });
  if (payload.elevator) filters.push({ key: "elevator", operator: "eq", value: true });
  if (payload.parking) filters.push({ key: "parking", operator: "eq", value: true });
  if (payload.pets) filters.push({ key: "pets_allowed", operator: "eq", value: true });
  return filters;
}

function mapProfile(raw: Record<string, unknown>): SearchProfile {
  const criteria = (raw.criteria ?? {}) as Record<string, unknown>;
  const locationData = criteria.location as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    isActive: Boolean(raw.isActive) || String(raw.isActive) === "true",
    notify: Boolean(raw.notify) || String(raw.notify) === "true",
    criteria,
    city: String(criteria.city ?? raw.city ?? ""),
    postal_code: String(criteria.postalCode ?? locationData?.postalCode ?? ""),
    radius_km: locationData?.radiusKm != null ? Number(locationData.radiusKm) : null,
    price_min: criteria.price_gte != null ? Number(criteria.price_gte) : null,
    price_max: criteria.price_lte != null ? Number(criteria.price_lte) : null,
    area_min: criteria.area_gte != null ? Number(criteria.area_gte) : null,
    area_max: criteria.area_lte != null ? Number(criteria.area_lte) : null,
    rooms_min: criteria.rooms_gte != null ? Number(criteria.rooms_gte) : null,
    balcony: criteria.balcony === "true" || criteria.balcony === true,
    elevator: criteria.elevator === "true" || criteria.elevator === true,
    parking: criteria.parking === "true" || criteria.parking === true,
    pets: criteria.pets_allowed === "true" || criteria.pets_allowed === true,
    status: (raw.isActive ? "active" : "suspended") as "active" | "suspended",
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
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
  name: string;
  enabled: boolean;
  listings_count: number;
}

export interface AdminQueueStatus {
  collect: { waiting: number; active: number };
  match: { waiting: number; active: number };
  notify: { waiting: number; active: number };
}

export interface AdminAuditLog {
  id: string;
  action: string;
  user_id: string;
  details: string;
  created_at: string;
}

export const api = {
  login: (payload: LoginPayload) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  register: (payload: RegisterPayload) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMe: () => request<User>("/auth/me"),

  getProfiles: async (): Promise<SearchProfile[]> => {
    const data = await request<Record<string, unknown>[]>("/profiles");
    return (data ?? []).map(mapProfile);
  },

  createProfile: async (payload: CreateProfilePayload) => {
    const body = {
      name: payload.name,
      notify: payload.notify ?? true,
      filters: buildFilters(payload),
    };
    const data = await request<Record<string, unknown>>("/profiles", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapProfile(data);
  },

  updateProfile: async (id: string, payload: CreateProfilePayload) => {
    const body = {
      name: payload.name,
      notify: payload.notify,
      filters: buildFilters(payload),
    };
    const data = await request<Record<string, unknown>>(`/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return mapProfile(data);
  },

  deleteProfile: (id: string) =>
    request<void>(`/profiles/${id}`, { method: "DELETE" }),

  getMatches: async (profileId?: string) => {
    const qs = profileId ? `?profile_id=${profileId}` : "";
    return request<Match[]>(`/matches${qs}`);
  },

  getTelegramLink: async (): Promise<TelegramLinkResponse> => {
    try {
      const data = await request<{ url?: string; token?: string; connected?: boolean }>("/telegram/link");
      return { link: data?.url ?? "", connected: data?.connected ?? !!data?.token };
    } catch {
      return { link: "", connected: false };
    }
  },

  getAdminStats: () => request<AdminStats>("/admin/stats"),

  getAdminSources: () => request<AdminSource[]>("/admin/sources"),

  toggleSource: (id: string, enabled: boolean) =>
    request<AdminSource>(`/admin/sources/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),

  getQueueStatus: () => request<AdminQueueStatus>("/admin/queue"),

  getAuditLogs: () => request<AdminAuditLog[]>("/admin/audit-logs"),
};

export { ApiError };
