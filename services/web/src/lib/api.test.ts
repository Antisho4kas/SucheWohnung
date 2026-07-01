import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  buildFilters,
  mapProfile,
  normalizeFilterDefinition,
  type FilterDefinition,
} from "./api";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function fetchInitAt(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
): RequestInit {
  const init = fetchMock.mock.calls[index]?.[1];
  if (!init || typeof init !== "object") throw new Error("missing fetch init");
  return init as RequestInit;
}

describe("web API contract adapter", () => {
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
    vi.unstubAllGlobals();
  });

  it("accepts backend cookie-session login responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "access" }));

    await expect(
      api.login({ email: "u@example.com", password: "secret" }),
    ).resolves.toEqual({
      access_token: "access",
    });
  });

  it("keeps register as the backend registration acknowledgement", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "user-1" }, { status: 201 }),
    );

    await expect(
      api.register({ email: "u@example.com", password: "secret123" }),
    ).resolves.toEqual({
      id: "user-1",
    });
  });

  it("uses cookie refresh and returns the rotated access token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: "next-access",
      }),
    );

    await expect(api.refresh()).resolves.toEqual({
      access_token: "next-access",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({}),
        credentials: "include",
      }),
    );
  });

  it("surfaces API error envelope message and metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid payload",
            details: [{ field: "email", issue: "Invalid email" }],
            request_id: "req-1",
          },
        },
        { status: 400 },
      ),
    );

    await expect(api.getProfiles()).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid payload",
      status: 400,
      code: "VALIDATION_ERROR",
      details: [{ field: "email", issue: "Invalid email" }],
      requestId: "req-1",
    } satisfies Partial<ApiError>);
  });

  it("normalizes admin sources from backend observability shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "src-1",
            name: "Mock",
            slug: "mock",
            is_active: true,
            breaker_state: "half_open",
            health: "degraded",
            listings_count: 7,
            lifecycle_status: "ready",
            last_run_status: "partial",
            items_fetched: 12,
            items_new: 3,
            items_updated: 2,
            errors: 1,
            last_run: {
              id: "run-1",
              source_id: "src-1",
              status: "partial",
              items_fetched: 12,
              items_new: 3,
              items_updated: 2,
              errors: 1,
              started_at: "2026-06-03T10:00:00.000Z",
              finished_at: "2026-06-03T10:01:30.000Z",
            },
          },
          {
            id: "src-2",
            name: "Idle",
            slug: "idle",
            enabled: false,
            breaker_state: null,
            listings_count: null,
            lifecycle_status: "permission-needed",
            last_run: null,
          },
        ],
      }),
    );

    await expect(api.getAdminSources()).resolves.toEqual([
      {
        id: "src-1",
        name: "Mock",
        slug: "mock",
        enabled: true,
        is_active: true,
        breakerState: "half_open",
        lifecycleStatus: "ready",
        health: "degraded",
        listings_count: 7,
        lastRunStatus: "partial",
        itemsFetched: 12,
        itemsNew: 3,
        itemsUpdated: 2,
        errors: 1,
        lastRun: {
          id: "run-1",
          sourceId: "src-1",
          status: "partial",
          itemsFetched: 12,
          itemsNew: 3,
          itemsUpdated: 2,
          errors: 1,
          startedAt: "2026-06-03T10:00:00.000Z",
          finishedAt: "2026-06-03T10:01:30.000Z",
        },
      },
      {
        id: "src-2",
        name: "Idle",
        slug: "idle",
        enabled: false,
        is_active: false,
        breakerState: "closed",
        lifecycleStatus: "permission-needed",
        health: "unknown",
        listings_count: 0,
        lastRunStatus: null,
        itemsFetched: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        errors: 0,
        lastRun: null,
      },
    ]);
  });

  it("normalizes source runs from backend snake_case shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "run-1",
            source_id: "src-1",
            status: "running",
            items_fetched: 5,
            items_new: 2,
            items_updated: 1,
            errors: 0,
            started_at: "2026-06-03T10:00:00.000Z",
            finished_at: null,
          },
        ],
      }),
    );

    await expect(api.getSourceRuns("src-1")).resolves.toEqual([
      {
        id: "run-1",
        sourceId: "src-1",
        status: "running",
        itemsFetched: 5,
        itemsNew: 2,
        itemsUpdated: 1,
        errors: 0,
        startedAt: "2026-06-03T10:00:00.000Z",
        finishedAt: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/admin/sources/src-1/runs",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("normalizes admin queue counts and depth", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          collect: {
            waiting: 4,
            active: 2,
            delayed: 3,
            failed: 1,
            completed: 20,
            depth: 4,
          },
          match: { waiting: null, active: undefined },
          notify: {
            waiting: 1,
            active: 0,
            delayed: 7,
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
        delayed: 7,
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

  it("normalizes admin audit logs from canonical backend DTOs", async () => {
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
          {
            id: "log-2",
            actorId: "actor-2",
            action: "admin.source.toggle",
            details: "source disabled",
            createdAt: "2026-06-03T14:00:00.000Z",
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
      {
        id: "log-2",
        actorId: "actor-2",
        userEmail: null,
        action: "admin.source.toggle",
        meta: {},
        details: "source disabled",
        createdAt: "2026-06-03T14:00:00.000Z",
      },
    ]);
  });

  it("uses the backend source toggle endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "src-1",
          name: "Mock",
          slug: "mock",
          is_active: false,
          listings_count: 7,
        },
      }),
    );

    await expect(api.toggleSource("src-1", false)).resolves.toMatchObject({
      id: "src-1",
      enabled: false,
      is_active: false,
      listings_count: 7,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/admin/sources/src-1/toggle",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps profile criteria from spec snake_case shape and attrs", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "profile-1",
            name: "Berlin",
            is_active: true,
            notify: true,
            criteria: {
              city: "Berlin",
              postal_code: "10115",
              location: { radius_km: 5 },
              price: { gte: 800, lte: 1300 },
              area: { gte: 45, lte: 80 },
              rooms: { gte: 2 },
              attrs: {
                balcony: true,
                elevator: true,
                parking: false,
                pets_allowed: true,
              },
            },
            created_at: "2026-06-01T10:00:00.000Z",
            updated_at: "2026-06-01T11:00:00.000Z",
          },
        ],
      }),
    );

    await expect(api.getProfiles()).resolves.toEqual([
      expect.objectContaining({
        id: "profile-1",
        isActive: true,
        status: "active",
        city: "Berlin",
        postal_code: "10115",
        radius_km: 5,
        price_min: 800,
        price_max: 1300,
        area_min: 45,
        area_max: 80,
        rooms_min: 2,
        balcony: true,
        elevator: true,
        parking: false,
        pets: true,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T11:00:00.000Z",
      }),
    ]);
  });

  it("only emits location filters when radius has coordinates", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "profile-1",
            name: "Berlin",
            is_active: true,
            criteria: {},
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "profile-2",
            name: "Munich",
            is_active: true,
            criteria: {},
          },
        }),
      );

    await api.createProfile({
      name: "Berlin",
      city: "Berlin",
      postal_code: "10115",
      radius_km: 5,
      filterDefinitions: definitions,
    });
    await api.createProfile({
      name: "Munich",
      city: "Munich",
      radius_km: 10,
      lat: 48.137,
      lng: 11.575,
      filterDefinitions: definitions,
    });

    const firstBody = JSON.parse(String(fetchInitAt(fetchMock, 0).body));
    const secondBody = JSON.parse(String(fetchInitAt(fetchMock, 1).body));
    expect(firstBody.filters).not.toContainEqual(
      expect.objectContaining({ key: "location" }),
    );
    expect(secondBody.filters).toContainEqual({
      key: "location",
      operator: "within",
      value: { lat: 48.137, lng: 11.575, radius_km: 10 },
    });
  });

  it("serializes auto-reply fields on create and trims the prepared text", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "profile-1",
          name: "Berlin",
          is_active: true,
          notify: true,
          criteria: {},
        },
      }),
    );

    await api.createProfile({
      name: "Berlin",
      city: "Berlin",
      auto_reply_enabled: true,
      auto_reply_text: "  Hallo, ist die Wohnung noch verfügbar?  ",
      filterDefinitions: definitions,
    });

    const body = JSON.parse(String(fetchInitAt(fetchMock, 0).body));
    expect(body.auto_reply_enabled).toBe(true);
    expect(body.auto_reply_text).toBe("Hallo, ist die Wohnung noch verfügbar?");
  });

  it("nulls the auto-reply text when auto-reply is disabled", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "profile-1",
          name: "Berlin",
          is_active: true,
          notify: true,
          criteria: {},
        },
      }),
    );

    await api.updateProfile("profile-1", {
      auto_reply_enabled: false,
      auto_reply_text: "ignored when disabled",
    });

    const body = JSON.parse(String(fetchInitAt(fetchMock, 0).body));
    expect(body.auto_reply_enabled).toBe(false);
    expect(body.auto_reply_text).toBeNull();
  });

  it("maps auto-reply fields from the backend profile response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "profile-1",
            name: "Berlin",
            is_active: true,
            notify: true,
            auto_reply_enabled: true,
            auto_reply_text: "Hallo, ist die Wohnung noch verfügbar?",
            criteria: {},
          },
        ],
      }),
    );

    await expect(api.getProfiles()).resolves.toEqual([
      expect.objectContaining({
        id: "profile-1",
        auto_reply_enabled: true,
        auto_reply_text: "Hallo, ist die Wohnung noch verfügbar?",
      }),
    ]);
  });

  it("does not send an empty filters array for partial profile status updates", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "profile-1",
          name: "Berlin",
          is_active: false,
          notify: true,
          criteria: {},
        },
      }),
    );

    await api.updateProfile("profile-1", { is_active: false });

    const init = fetchInitAt(fetchMock, 0);
    expect(JSON.parse(String(init.body))).toEqual({ is_active: false });
  });

  it("maps match listing fields from real backend shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "match-1",
            profile_id: "profile-1",
            listing_id: "listing-1",
            matched_at: "2026-06-01T12:00:00.000Z",
            state: "pending",
            listing: {
              id: "listing-1",
              title: "Altbau",
              url: "https://example.com/listing-1",
              price: "1200.00",
              city: "Berlin",
            },
          },
        ],
      }),
    );

    await expect(api.getMatches("profile-1")).resolves.toEqual([
      {
        id: "match-1",
        profileId: "profile-1",
        listingId: "listing-1",
        matchedAt: "2026-06-01T12:00:00.000Z",
        state: "pending",
        listing: {
          id: "listing-1",
          title: "Altbau",
          url: "https://example.com/listing-1",
          price: "1200.00",
          city: "Berlin",
        },
      },
    ]);
  });
});

const definitions: FilterDefinition[] = [
  normalizeFilterDefinition({
    key: "city",
    label: { de: "Stadt", ru: "Город" },
    dataType: "text",
    operatorSet: ["eq", "in"],
    isActive: true,
  }),
  normalizeFilterDefinition({
    key: "price",
    label: { de: "Preis" },
    data_type: "number",
    operator_set: ["gte", "lte"],
    config: { unit: "EUR", validation: { min: 0 } },
    is_active: true,
  }),
  normalizeFilterDefinition({
    key: "area",
    label: { de: "Fläche" },
    dataType: "number",
    operatorSet: ["gte", "lte"],
    isActive: true,
  }),
  normalizeFilterDefinition({
    key: "rooms",
    label: { de: "Zimmer" },
    dataType: "number",
    operatorSet: ["gte"],
    isActive: true,
  }),
  normalizeFilterDefinition({
    key: "location",
    label: { de: "Umkreis" },
    dataType: "geo",
    operatorSet: ["within"],
    isActive: true,
  }),
  normalizeFilterDefinition({
    key: "pets_allowed",
    label: { de: "Haustiere erlaubt" },
    dataType: "bool",
    operatorSet: ["eq"],
    isActive: true,
  }),
  normalizeFilterDefinition({
    key: "provisionfrei",
    label: { de: "Provisionsfrei" },
    dataType: "bool",
    operatorSet: ["eq"],
    isActive: true,
  }),
];

describe("schema-driven profile filter mapping", () => {
  it("builds filters from backend definitions instead of hardcoded field assumptions", () => {
    expect(
      buildFilters(
        {
          city: "Berlin",
          price_min: "800",
          price_max: "1300",
          area_min: "45",
          rooms_min: "2",
          pets_allowed: true,
          provisionfrei: true,
          balcony: true,
        },
        definitions,
      ),
    ).toEqual([
      { key: "city", operator: "eq", value: "Berlin" },
      { key: "price", operator: "gte", value: 800 },
      { key: "price", operator: "lte", value: 1300 },
      { key: "area", operator: "gte", value: 45 },
      { key: "rooms", operator: "gte", value: 2 },
      { key: "pets_allowed", operator: "eq", value: true },
      { key: "provisionfrei", operator: "eq", value: true },
    ]);
  });

  it("builds radius payload only when geo coordinates and radius are complete", () => {
    expect(
      buildFilters(
        { lat: "52.52", lng: "13.405", radius_km: "5" },
        definitions,
      ),
    ).toEqual([
      {
        key: "location",
        operator: "within",
        value: { lat: 52.52, lng: 13.405, radius_km: 5 },
      },
    ]);

    expect(buildFilters({ radius_km: "5" }, definitions)).toEqual([]);
  });

  it("validates numeric ranges before sending profile filters", () => {
    expect(() =>
      buildFilters({ price_min: "1400", price_max: "1200" }, definitions),
    ).toThrow("price: min must be <= max");

    expect(() =>
      buildFilters({ price_min: "not-a-number" }, definitions),
    ).toThrow("price: invalid number");
  });

  it("maps profile criteria into generic form values and legacy dashboard fields", () => {
    expect(
      mapProfile({
        id: "profile-1",
        name: "Berlin",
        is_active: true,
        notify: true,
        criteria: {
          city: "Berlin",
          postal_code: "10115",
          location: { lat: 52.52, lng: 13.405, radius_km: 5 },
          price: { gte: 800, lte: 1300 },
          area: { gte: 45 },
          rooms: { gte: 2 },
          attrs: {
            pets_allowed: true,
            provisionfrei: true,
            furnished: true,
          },
        },
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T11:00:00.000Z",
      }),
    ).toEqual(
      expect.objectContaining({
        city: "Berlin",
        postal_code: "10115",
        radius_km: 5,
        price_min: 800,
        price_max: 1300,
        area_min: 45,
        rooms_min: 2,
        pets: true,
        attrs: {
          pets_allowed: true,
          provisionfrei: true,
          furnished: true,
        },
        filterValues: expect.objectContaining({
          city: "Berlin",
          postal_code: "10115",
          lat: 52.52,
          lng: 13.405,
          radius_km: 5,
          price_min: 800,
          price_max: 1300,
          area_min: 45,
          rooms_min: 2,
          pets_allowed: true,
          provisionfrei: true,
          furnished: true,
        }),
      }),
    );
  });
});
