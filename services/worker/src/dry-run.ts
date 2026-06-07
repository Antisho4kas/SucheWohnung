/**
 * Approved real-source low-rate dry-run runner (Developer O).
 *
 * Safely exercises a single approved real-source connector against the LIVE site
 * at a low request rate, WITHOUT ever propagating to match/notify.
 *
 * Safety properties:
 *  - Uses a NO-OP match queue, so `enqueueMatch` is a no-op and no Telegram
 *    notification can ever be produced by a dry-run.
 *  - Refuses to run unless DATABASE_URL points at an isolated dry-run database
 *    (database name must contain "dryrun") unless DRY_RUN_FORCE=1 is set.
 *  - Caps items per run (default 5), forces maxPages=1 and a conservative
 *    rateLimitMs (>= 1000ms) regardless of seed config.
 *  - Runs twice by default to verify dedup (no duplicate flood on second run).
 *
 * Usage (on the isolated dry-run environment):
 *   DATABASE_URL=postgresql://app:app@localhost:5432/suchewohnung_dryrun?schema=public \
 *   SOURCE_SLUG=leg-wohnen \
 *   node dist/dry-run.js
 *
 * For local/dev with tsx:
 *   DATABASE_URL=... SOURCE_SLUG=leg-wohnen npx tsx src/dry-run.ts
 */
import { prisma } from "./prisma.js";
import {
  runCollectJob,
  type CollectDeps,
} from "./workers/collect.js";
import { createDefaultConnectorRegistry } from "@suchewohnung/shared";

type SampleListing = {
  externalId: string;
  url: string;
  title: string | null;
  price: unknown;
  warmRent: unknown;
  area: unknown;
  rooms: unknown;
  city: string | null;
  postalCode: string | null;
  attributes: unknown;
  imageCount: number;
};

type RunReport = {
  runNumber: number;
  sourceRunId: string | null;
  status: string | null;
  itemsFetched: number | null;
  itemsNew: number | null;
  itemsUpdated: number | null;
  errors: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

const SOURCE_SLUG = process.env.SOURCE_SLUG ?? "leg-wohnen";
const MAX_ITEMS = clampInt(process.env.DRY_RUN_MAX_ITEMS, 5, 1, 25);
const RUNS = clampInt(process.env.DRY_RUN_RUNS, 2, 1, 5);
const RATE_LIMIT_MS = Math.max(
  1_000,
  clampInt(process.env.DRY_RUN_RATE_LIMIT_MS, 1_000, 0, 60_000),
);
const CITY = process.env.DRY_RUN_CITY ?? "Mönchengladbach";

function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function assertIsolatedDatabase(): void {
  if (process.env.DRY_RUN_FORCE === "1") {
    console.warn(
      "[dry-run] DRY_RUN_FORCE=1 set: skipping isolated-database guard. " +
        "Ensure this DATABASE_URL has NO real users / active notify worker.",
    );
    return;
  }
  const url = process.env.DATABASE_URL ?? "";
  // Parse the path segment (database name) defensively without leaking creds.
  const dbName = (() => {
    try {
      return new URL(url).pathname.replace(/^\//u, "").toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!dbName.includes("dryrun")) {
    throw new Error(
      `Refusing to run: DATABASE_URL database name "${dbName || "<unparsed>"}" ` +
        `does not contain "dryrun". Point at an isolated dry-run database, or ` +
        `set DRY_RUN_FORCE=1 only if you are certain it is safe.`,
    );
  }
}

/**
 * Ensure the source exists in the isolated DB as active + beta + approved so the
 * collect activation guard allows it. Low-rate config is forced here.
 */
async function ensureSource(): Promise<{ id: string }> {
  const config = {
    lifecycleStatus: "beta",
    activationApproved: true,
    baseUrl: "https://www.leg-wohnen.de",
    sitemapIndexPath: "/sitemap.xml",
    city: CITY,
    minRooms: 1,
    maxRooms: 4,
    maxPages: 1,
    itemsPerRun: MAX_ITEMS,
    rateLimitMs: RATE_LIMIT_MS,
    userAgent: "SucheWohnung/1.0",
  };

  // Cast: the generated Prisma client accepts JSON config; keep this loose to
  // avoid coupling the dry-run runner to the full generated types.
  const client = prisma as unknown as {
    source: {
      upsert(args: unknown): Promise<{ id: string }>;
    };
  };

  return client.source.upsert({
    where: { slug: SOURCE_SLUG },
    create: {
      slug: SOURCE_SLUG,
      name: `${SOURCE_SLUG} (dry-run)`,
      integrationType: "scrape",
      isActive: true,
      scheduleCron: "*/30 * * * *",
      rateLimitRpm: 6,
      config,
    },
    update: {
      isActive: true,
      config,
    },
  });
}

async function readLatestRun(
  sourceId: string,
): Promise<Omit<RunReport, "runNumber">> {
  const client = prisma as unknown as {
    sourceRun: {
      findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    };
  };
  const run = await client.sourceRun.findFirst({
    where: { sourceId },
    orderBy: { startedAt: "desc" },
  });
  return {
    sourceRunId: run ? String(run.id) : null,
    status: run ? String(run.status) : null,
    itemsFetched: run ? toNum(run.itemsFetched) : null,
    itemsNew: run ? toNum(run.itemsNew) : null,
    itemsUpdated: run ? toNum(run.itemsUpdated) : null,
    errors: run ? toNum(run.errors) : null,
    startedAt: run?.startedAt ? new Date(run.startedAt as string).toISOString() : null,
    finishedAt: run?.finishedAt
      ? new Date(run.finishedAt as string).toISOString()
      : null,
  };
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function readSamples(sourceId: string): Promise<{
  total: number;
  samples: SampleListing[];
}> {
  const client = prisma as unknown as {
    listing: {
      count(args: unknown): Promise<number>;
      findMany(args: unknown): Promise<Record<string, unknown>[]>;
    };
  };
  const total = await client.listing.count({ where: { sourceId } });
  const rows = await client.listing.findMany({
    where: { sourceId },
    orderBy: { firstSeenAt: "desc" },
    take: 3,
    include: { images: true },
  });
  const samples: SampleListing[] = rows.map((row) => ({
    externalId: String(row.externalId ?? ""),
    url: String(row.url ?? ""),
    title: (row.title as string | null) ?? null,
    price: row.price ?? null,
    warmRent: row.warmRent ?? null,
    area: row.area ?? null,
    rooms: row.rooms ?? null,
    city: (row.city as string | null) ?? null,
    postalCode: (row.postalCode as string | null) ?? null,
    attributes: row.attributes ?? null,
    imageCount: Array.isArray(row.images) ? row.images.length : 0,
  }));
  return { total, samples };
}

async function main(): Promise<void> {
  assertIsolatedDatabase();

  console.log(
    `[dry-run] source=${SOURCE_SLUG} maxItems=${MAX_ITEMS} runs=${RUNS} ` +
      `rateLimitMs=${RATE_LIMIT_MS} city=${CITY}`,
  );

  const source = await ensureSource();
  const registry = createDefaultConnectorRegistry();

  // NO-OP match queue: guarantees no match/notify job is ever enqueued.
  const noopMatchQueue: CollectDeps["matchQueue"] = {
    add: async () => undefined,
  };

  const deps: CollectDeps = {
    prisma: prisma as unknown as CollectDeps["prisma"],
    matchQueue: noopMatchQueue,
    connectors: registry,
  };

  const reports: RunReport[] = [];
  for (let i = 1; i <= RUNS; i++) {
    console.log(`[dry-run] starting run ${i}/${RUNS} ...`);
    try {
      await runCollectJob({ data: { sourceSlug: SOURCE_SLUG } }, deps);
    } catch (err) {
      console.error(
        `[dry-run] run ${i} threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const latest = await readLatestRun(source.id);
    reports.push({ runNumber: i, ...latest });
  }

  const { total, samples } = await readSamples(source.id);

  const report = {
    source: SOURCE_SLUG,
    config: { maxItems: MAX_ITEMS, maxPages: 1, rateLimitMs: RATE_LIMIT_MS, city: CITY },
    runs: reports,
    totalListingsInDb: total,
    sampleListings: samples,
    dedupObservation:
      reports.length >= 2
        ? `run1 new=${reports[0]?.itemsNew} run2 new=${reports[1]?.itemsNew} (expect run2 new=0 if dedup holds)`
        : "single run; dedup not exercised",
  };

  console.log("\n===== DRY-RUN REPORT (JSON) =====");
  console.log(JSON.stringify(report, null, 2));
  console.log("===== END REPORT =====\n");
}

main()
  .catch((err) => {
    console.error("[dry-run] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const client = prisma as unknown as { $disconnect?: () => Promise<void> };
    if (typeof client.$disconnect === "function") {
      await client.$disconnect();
    }
  });
