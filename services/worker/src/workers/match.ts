import { Queue, Worker } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import { buildFilterIndex, evaluateProfile } from "@suchewohnung/shared";
import type {
  FilterDataType,
  FilterDefinition,
  FilterFieldBinding,
  FilterOperator,
  GeoPoint,
} from "@suchewohnung/shared";

type DbFilterDefinition = {
  readonly key: string;
  readonly label: unknown;
  readonly dataType: string;
  readonly operatorSet: string[];
  readonly config: unknown;
  readonly isActive: boolean;
};

type MatchPrismaLike = {
  listing: {
    findUnique(args: unknown): Promise<any>;
  };
  filterDefinition: {
    findMany(args: unknown): Promise<DbFilterDefinition[]>;
  };
  searchProfile: {
    findMany(args: unknown): Promise<SearchProfileRecord[]>;
  };
  match: {
    create(args: unknown): Promise<{ id: string }>;
    findUnique(args: unknown): Promise<{ id: string; state: string } | null>;
  };
  $queryRaw<T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T>;
};

type SearchProfileRecord = {
  id: string;
  notify: boolean;
  filters: Array<{
    operator: string;
    value: unknown;
    definition: { key: string };
  }>;
};

type NotifyQueueLike = {
  add(
    name: string,
    data: Record<string, unknown>,
    opts: Record<string, unknown>,
  ): Promise<unknown>;
};

type MatchEvent = "created" | "changed";

export type MatchDeps = {
  prisma: MatchPrismaLike;
  notifyQueue: NotifyQueueLike;
};

function createDefaultDeps(): MatchDeps {
  const connection = createRedisConnection();
  return {
    prisma: prisma as unknown as MatchPrismaLike,
    notifyQueue: new Queue("notify", { connection }),
  };
}

const legacyColumnBindings: Record<string, FilterFieldBinding> = {
  city: { column: "city" },
  bundesland: { column: "bundesland" },
  postal_code: { column: "postalCode" },
  location: { column: "geo" },
  price: { column: "price" },
  area: { column: "area" },
  rooms: { column: "rooms" },
};

const NOTIFY_JOB_OPTIONS = {
  removeOnComplete: 5000,
  removeOnFail: 5000,
  attempts: 5,
  backoff: { type: "exponential", delay: 3000 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBinding(def: DbFilterDefinition): FilterFieldBinding {
  const configuredBinding =
    isRecord(def.config) && isRecord(def.config.binding)
      ? def.config.binding
      : undefined;
  if (configuredBinding) {
    const column = configuredBinding.column;
    const attribute = configuredBinding.attribute;
    if (typeof column === "string") return { column };
    if (typeof attribute === "string") return { attribute };
  }

  const legacyBinding = legacyColumnBindings[def.key];
  if (legacyBinding) return legacyBinding;

  return def.dataType === "bool" ? { attribute: def.key } : {};
}

function toFilterDefinition(def: DbFilterDefinition): FilterDefinition {
  return {
    key: def.key,
    label: isRecord(def.label) ? (def.label as Record<string, string>) : {},
    dataType: def.dataType as FilterDataType,
    operatorSet: def.operatorSet as FilterOperator[],
    binding: readBinding(def),
    config: isRecord(def.config) ? def.config : {},
    isActive: def.isActive,
  };
}

async function loadFilterIndex(
  prismaClient: MatchPrismaLike,
): Promise<ReadonlyMap<string, FilterDefinition>> {
  const definitions = await prismaClient.filterDefinition.findMany({
    where: { isActive: true },
  });
  return buildFilterIndex(definitions.map((def) => toFilterDefinition(def)));
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function hasRadiusFilter(
  profiles: readonly SearchProfileRecord[],
  filterIndex: ReadonlyMap<string, FilterDefinition>,
): boolean {
  return profiles.some((profile) =>
    profile.filters.some((filter) => {
      const def = filterIndex.get(filter.definition.key);
      return def?.dataType === "geo" && filter.operator === "within";
    }),
  );
}

async function loadListingGeo(
  prismaClient: MatchPrismaLike,
  listingId: string,
): Promise<GeoPoint | undefined> {
  const rows = await prismaClient.$queryRaw<
    Array<{ lat: number | string | null; lng: number | string | null }>
  >`
    SELECT ST_Y("geo"::geometry) AS lat, ST_X("geo"::geometry) AS lng
    FROM "listings"
    WHERE "id" = ${listingId}::uuid AND "geo" IS NOT NULL
    LIMIT 1
  `;
  const row = rows[0];
  const lat = toNumber(row?.lat);
  const lng = toNumber(row?.lng);

  // No geocoding fallback: without persisted listing coordinates, radius filters
  // fail closed in the shared predicate engine to avoid false-positive matches.
  return lat === undefined || lng === undefined ? undefined : { lat, lng };
}

function safeJobIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function enqueueNotify(args: {
  notifyQueue: NotifyQueueLike;
  matchId: string;
  event: MatchEvent;
  changeVersion?: string;
}): Promise<void> {
  if (args.event === "changed" && !args.changeVersion) {
    throw new Error("changed notifications require changeVersion");
  }
  const jobId = args.changeVersion
    ? `notify-${args.matchId}-${safeJobIdPart(args.changeVersion)}`
    : `notify-${args.matchId}`;
  await args.notifyQueue.add(
    "notify",
    {
      matchId: args.matchId,
      event: args.event,
      ...(args.changeVersion ? { changeVersion: args.changeVersion } : {}),
    },
    {
      ...NOTIFY_JOB_OPTIONS,
      jobId,
    },
  );
}

async function findExistingMatch(
  deps: MatchDeps,
  profileId: string,
  listingId: string,
): Promise<{ id: string; state: string } | null> {
  return deps.prisma.match.findUnique({
    where: {
      uq_profile_listing: {
        profileId,
        listingId,
      },
    },
  });
}

export async function runMatchJob(
  job: {
    data: { listingId: string; event?: MatchEvent; changeVersion?: string };
  },
  deps: MatchDeps = createDefaultDeps(),
): Promise<void> {
  const { listingId, changeVersion } = job.data;
  const event = job.data.event ?? "created";
  if (event === "changed" && !changeVersion) {
    throw new Error("changed match events require changeVersion");
  }
  const listing = await deps.prisma.listing.findUnique({
    where: { id: listingId },
    include: { source: true },
  });
  if (!listing) {
    console.warn(`[match] Listing ${listingId} not found`);
    return;
  }
  if (listing.status !== "active" && listing.status !== "updated") {
    console.log(
      `[match] Listing ${listingId} status=${listing.status}, skipping`,
    );
    return;
  }

  const [filterIndex, listingGeo, profiles] = await Promise.all([
    loadFilterIndex(deps.prisma),
    loadListingGeo(deps.prisma, listingId),
    deps.prisma.searchProfile.findMany({
      where: {
        isActive: true,
      },
      include: { filters: { include: { definition: true } } },
    }),
  ]);

  let matched = 0;

  if (!listingGeo && hasRadiusFilter(profiles, filterIndex)) {
    console.warn(
      `[match] Listing ${listingId} has no persisted geo; radius filters fail closed`,
    );
  }

  for (const profile of profiles) {
    // Build precise filters
    const profileFilters = profile.filters.map((f) => ({
      key: f.definition.key,
      operator: f.operator as any,
      value: f.value as any,
    }));

    const listingNormalized = {
      sourceSlug: listing.source.slug,
      externalId: listing.externalId,
      url: listing.url,
      title: listing.title ?? undefined,
      dealType: "rent" as const,
      price: toNumber(listing.price),
      warmRent: toNumber(listing.warmRent),
      area: toNumber(listing.area),
      rooms: toNumber(listing.rooms),
      city: listing.city ?? undefined,
      bundesland: listing.bundesland as any,
      postalCode: listing.postalCode ?? undefined,
      geo: listingGeo,
      attributes: (listing.attributes as Record<string, unknown>) ?? {},
      images: [],
      raw: undefined,
    };

    const result = evaluateProfile(
      listingNormalized,
      profileFilters,
      filterIndex,
    );
    if (result.matched) {
      try {
        const match = await deps.prisma.match.create({
          data: {
            profileId: profile.id,
            listingId: listing.id,
            state: "pending",
          },
        });
        matched++;
        if (profile.notify) {
          await enqueueNotify({
            notifyQueue: deps.notifyQueue,
            matchId: match.id,
            event,
            changeVersion,
          });
        }
      } catch (err) {
        if ((err as any)?.code === "P2002") {
          console.log(
            `[match] Duplicate match for profile=${profile.id} listing=${listing.id}`,
          );
          const existing = await findExistingMatch(
            deps,
            profile.id,
            listing.id,
          );
          if (!existing) throw err;
          if (
            profile.notify &&
            (event === "changed" || existing.state === "pending")
          ) {
            await enqueueNotify({
              notifyQueue: deps.notifyQueue,
              matchId: existing.id,
              event,
              changeVersion,
            });
          }
        } else {
          throw err;
        }
      }
    }
  }

  console.log(`[match] Listing ${listingId} matched ${matched} profiles`);
}

if (process.env.VITEST !== "true") {
  const connection = createRedisConnection();
  const deps: MatchDeps = {
    prisma: prisma as unknown as MatchPrismaLike,
    notifyQueue: new Queue("notify", { connection }),
  };
  const worker = new Worker("match", async (job) => runMatchJob(job, deps), {
    connection,
    concurrency: 5,
  });

  worker.on("completed", (job) => console.log(`[match] completed ${job.id}`));
  worker.on("failed", (job, err) =>
    console.error(`[match] failed ${job?.id}`, err),
  );

  console.log("[match] Worker started");
}
