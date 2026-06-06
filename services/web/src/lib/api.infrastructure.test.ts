import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  clearAuthSession,
  setAuthFailureHandler,
  storeAuthSession,
} from "./api";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("web API adapter infrastructure", () => {
  const fetchMock = vi.fn();
  const storage = new Map<string, string>();

  beforeEach(() => {
    fetchMock.mockReset();
    storage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
  });

  afterEach(() => {
    clearAuthSession();
    setAuthFailureHandler(null);
    vi.unstubAllGlobals();
  });

  it("adds the bearer token from localStorage when present", async () => {
    storage.set("auth_token", "access-token");
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "user-1" }));

    await expect(api.getMe()).resolves.toEqual({ id: "user-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("continues without auth when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new Error("storage disabled");
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await expect(api.getProfiles()).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/profiles",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("parses API error envelopes into ApiError metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid payload",
            details: [{ path: ["email"], message: "Invalid email" }],
            request_id: "req-1",
          },
        },
        { status: 400 },
      ),
    );

    await expect(api.getProfiles()).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid payload",
      details: [{ path: ["email"], message: "Invalid email" }],
      requestId: "req-1",
    } satisfies Partial<ApiError>);
  });

  it("falls back to status text when error responses are not JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not-json", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(api.getProfiles()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      message: "Request failed with status 503",
    });
  });

  it("passes raw successful JSON through when no data envelope exists", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "access" }));

    await expect(
      api.login({ email: "u@example.com", password: "secret" }),
    ).resolves.toEqual({ access_token: "access" });
  });

  it("stores only the access token in browser storage", () => {
    storage.set("auth_refresh_token", "legacy-refresh");
    const sessionWithUnexpectedRefresh = {
      access_token: "access",
      refresh_token: "refresh-secret",
    };

    storeAuthSession(sessionWithUnexpectedRefresh);

    expect(storage.get("auth_token")).toBe("access");
    expect(storage.has("auth_refresh_token")).toBe(false);
    expect([...storage.values()]).not.toContain("refresh-secret");
  });

  it("uses cookie-based refresh payloads", async () => {
    storage.set("auth_token", "stale-access");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "next-access" }),
    );

    await expect(api.refresh()).resolves.toEqual({
      access_token: "next-access",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("refreshes once on 401 and retries with the rotated access token", async () => {
    storage.set("auth_token", "stale-access");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Unauthorized" } }, { status: 401 }),
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: "next-access" }))
      .mockResolvedValueOnce(jsonResponse({ id: "user-1" }));

    await expect(api.getMe()).resolves.toEqual({ id: "user-1" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer stale-access",
      }),
    });
    expect(fetchMock.mock.calls[1]).toEqual([
      "http://localhost:3000/api/v1/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer next-access" }),
    });
    expect(storage.get("auth_token")).toBe("next-access");
  });

  it("clears session and invokes auth failure handler when refresh fails", async () => {
    const onAuthFailure = vi.fn();
    storage.set("auth_token", "stale-access");
    storage.set("auth_refresh_token", "legacy-refresh");
    setAuthFailureHandler(onAuthFailure);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Unauthorized" } }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: "Invalid refresh token" } },
          { status: 401 },
        ),
      );

    await expect(api.getMe()).rejects.toMatchObject({
      status: 401,
      message: "Invalid refresh token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(storage.has("auth_token")).toBe(false);
    expect(storage.has("auth_refresh_token")).toBe(false);
  });

  it("calls logout without exposing refresh tokens in request body", async () => {
    storage.set("auth_token", "access-token");
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(api.logout()).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("unwraps data envelopes for list endpoints", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "profile-1", name: "Berlin" }] }),
    );

    await expect(api.getProfiles()).resolves.toEqual([
      expect.objectContaining({ id: "profile-1", name: "Berlin" }),
    ]);
  });

  it("does not fetch matches without a selected profile", async () => {
    await expect(api.getMatches()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps admin observability queues including telegram", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          collect: {
            waiting: 4,
            active: 2,
            delayed: 3,
            failed: 1,
            completed: 20,
          },
          match: { waiting: 0, active: 0 },
          notify: {
            waiting: 1,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 5,
          },
          telegram: {
            waiting: 2,
            active: 1,
            delayed: 4,
            failed: 3,
            completed: 8,
          },
        },
      }),
    );

    await expect(api.getQueueStatus()).resolves.toEqual({
      collect: {
        waiting: 4,
        active: 2,
        delayed: 3,
        failed: 1,
        completed: 20,
        depth: 4,
      },
      match: {
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
        depth: 0,
      },
      notify: {
        waiting: 1,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 5,
        depth: 1,
      },
      telegram: {
        waiting: 2,
        active: 1,
        delayed: 4,
        failed: 3,
        completed: 8,
        depth: 2,
      },
    });
  });

  it("maps admin source run summary fields gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "src-1",
            slug: "mock",
            name: "Mock",
            is_active: true,
            breaker_state: "half_open",
            lifecycle_status: "ready",
            health: "degraded",
            listings_count: 7,
            last_run_status: "partial",
            items_fetched: 12,
            items_new: 3,
            items_updated: 2,
            errors: 1,
            last_run: null,
          },
        ],
      }),
    );

    await expect(api.getAdminSources()).resolves.toEqual([
      expect.objectContaining({
        id: "src-1",
        breakerState: "half_open",
        lifecycleStatus: "ready",
        lastRunStatus: "partial",
        itemsFetched: 12,
        itemsNew: 3,
        itemsUpdated: 2,
        errors: 1,
        lastRun: null,
      }),
    ]);
  });

  it("maps admin audit logs from canonical API DTOs", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "log-1",
            actor_id: "actor-1",
            user_email: "admin@example.com",
            action: "admin.queue.retry",
            meta: { queue: "collect", retried: 2 },
            created_at: "2026-06-03T13:00:00.000Z",
          },
        ],
      }),
    );

    await expect(api.getAuditLogs()).resolves.toEqual([
      {
        id: "log-1",
        actorId: "actor-1",
        userEmail: "admin@example.com",
        action: "admin.queue.retry",
        meta: { queue: "collect", retried: 2 },
        details: '{"queue":"collect","retried":2}',
        createdAt: "2026-06-03T13:00:00.000Z",
      },
    ]);
  });

  it("uses the DELETE method for profile removal", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    await expect(api.deleteProfile("profile-1")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/profiles/profile-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("returns a safe empty Telegram link on API failures", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: "Unauthorized" } }, { status: 401 }),
    );

    await expect(api.getTelegramLink()).resolves.toEqual({
      link: "",
      connected: false,
    });
  });
});
