const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
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
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body?.message ?? body?.error ?? `Request failed with status ${res.status}`,
      res.status,
    );
  }

  return res.json();
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
  city: string;
  price_min: number | null;
  price_max: number | null;
  area_min: number | null;
  area_max: number | null;
  rooms_min: number | null;
  balcony: boolean;
  elevator: boolean;
  parking: boolean;
  pets: boolean;
  notifications_enabled: boolean;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface CreateProfilePayload {
  name: string;
  city: string;
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  rooms_min?: number;
  balcony?: boolean;
  elevator?: boolean;
  parking?: boolean;
  pets?: boolean;
  notifications_enabled?: boolean;
}

export interface Match {
  id: string;
  listing_id: string;
  profile_id: string;
  score: number;
  notified_at: string | null;
  seen_at: string | null;
  created_at: string;
  listing?: {
    title: string;
    url: string;
    price: number;
    city: string;
    created_at: string;
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

  getProfiles: () => request<SearchProfile[]>("/profiles"),

  createProfile: (payload: CreateProfilePayload) =>
    request<SearchProfile>("/profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateProfile: (id: string, payload: CreateProfilePayload) =>
    request<SearchProfile>(`/profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteProfile: (id: string) =>
    request<void>(`/profiles/${id}`, {
      method: "DELETE",
    }),

  getMatches: (profileId?: string) => {
    const qs = profileId ? `?profile_id=${profileId}` : "";
    return request<Match[]>(`/matches${qs}`);
  },

  getTelegramLink: () => request<TelegramLinkResponse>("/telegram/link"),

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
