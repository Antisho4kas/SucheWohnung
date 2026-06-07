import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import {
  SEED_FILTER_DEFINITIONS,
  MOCK_SOURCE_SLUG,
  KLEINANZEIGEN_SOURCE_SLUG,
  IMMOWELT_SOURCE_SLUG,
  IMMOSCOUT_SOURCE_SLUG,
  LEG_WOHNEN_SOURCE_SLUG,
  WG_GESUCHT_SOURCE_SLUG,
  IMMOBILO_SOURCE_SLUG,
  WOHNUNGSBOERSE_SOURCE_SLUG,
} from "@suchewohnung/shared";

/**
 * Seed: base filter_definitions (schema-driven, §10.2) + a demo mock source
 * (§5.7, §7.7) so the platform is end-to-end runnable on Stage 1 with no real
 * source. Idempotent (upsert by unique key).
 */
const prisma = new PrismaClient();

type SeedSource = {
  slug: string;
  name: string;
  integrationType: "api" | "scrape";
  isActive: boolean;
  scheduleCron: string;
  rateLimitRpm: number;
  config: Record<string, unknown>;
};

const MOCK_READY_CONFIG = {
  lifecycleStatus: "ready",
  activationApproved: true,
} as const;

// Approved, runtime-ready real sources (operator-approved for limited beta).
const REAL_SOURCE_READY_CONFIG = {
  lifecycleStatus: "ready",
  activationApproved: true,
} as const;

const REAL_SOURCE_PERMISSION_NEEDED_CONFIG = {
  lifecycleStatus: "permission-needed",
  activationApproved: false,
  activationBlockReason:
    "Requires source onboarding, legal/robots approval, and dry-run review before beta activation.",
} as const;

const EXPERIMENTAL_SOURCE_CONFIG = {
  lifecycleStatus: "experimental",
  activationApproved: false,
  activationBlockReason:
    "Connector is exported but not wired into the default collect registry; complete source onboarding before activation.",
} as const;

const IMMOBILO_CONFIG = {
  baseUrl: "https://www.immobilo.de",
  sitemapIndexUrl: "/sitemap.xml",
  sitemapSerpPattern: "sitemap-serp",
  sitemapExpPattern: "sitemap-exp",
  healthPath: "/robots.txt",
  maxSerpPages: 500,
  maxExposePages: 5000,
  pageDelayMs: 1000,
  aggregator: true,
  sourceKind: "aggregator",
  dedupeRisk: "high",
  dedupeRiskNote:
    "Aggregator source: listings can mirror upstream portals, so cross-source duplicate risk is elevated.",
} as const;

function withLifecycle(
  config: Record<string, unknown>,
  lifecycle: Record<string, unknown>,
): Record<string, unknown> {
  return { ...config, ...lifecycle };
}

export const SEED_SOURCES: SeedSource[] = [
  {
    slug: MOCK_SOURCE_SLUG,
    name: "Mock Source (dev)",
    integrationType: "api",
    isActive: true,
    scheduleCron: "*/5 * * * *",
    rateLimitRpm: 120,
    config: withLifecycle({ mock: true, itemsPerRun: 25 }, MOCK_READY_CONFIG),
  },
  {
    slug: KLEINANZEIGEN_SOURCE_SLUG,
    name: "eBay Kleinanzeigen",
    integrationType: "scrape",
    isActive: true,
    scheduleCron: "*/15 * * * *",
    rateLimitRpm: 10,
    config: withLifecycle(
      {
        // Reads listings via the self-hosted ebay-kleinanzeigen-api adapter
        // (DanielWTE/ebay-kleinanzeigen-api) reachable on the compose network.
        baseUrl: "http://kleinanzeigen-api:8000",
        // Upstream adapter exposes no /health route; root "/" returns
        // {"status":"operational"} with HTTP 200, which the connector's
        // status-only health check treats as healthy.
        healthPath: "/",
        searchPath: "/inserate",
        detailPath: "/inserat/{adid}",
        query: "wohnung mieten",
        city: "berlin",
        maxPrice: 2000,
        maxPages: 2,
        batchId: "suchewohnung",
        itemsPerRun: 25,
      },
      REAL_SOURCE_READY_CONFIG,
    ),
  },
  {
    slug: IMMOWELT_SOURCE_SLUG,
    name: "Immowelt",
    integrationType: "scrape",
    isActive: false,
    scheduleCron: "*/30 * * * *",
    rateLimitRpm: 5,
    config: withLifecycle(
      { city: "ingolstadt", maxPrice: 800, maxPages: 2 },
      REAL_SOURCE_PERMISSION_NEEDED_CONFIG,
    ),
  },
  {
    slug: IMMOSCOUT_SOURCE_SLUG,
    name: "Immobilienscout24",
    integrationType: "scrape",
    isActive: false,
    scheduleCron: "*/30 * * * *",
    rateLimitRpm: 5,
    config: withLifecycle(
      { city: "ingolstadt", maxPrice: 800, maxPages: 2 },
      REAL_SOURCE_PERMISSION_NEEDED_CONFIG,
    ),
  },
  {
    slug: IMMOBILO_SOURCE_SLUG,
    name: "Immobilo",
    integrationType: "scrape",
    isActive: false,
    scheduleCron: "*/45 * * * *",
    rateLimitRpm: 4,
    config: withLifecycle(IMMOBILO_CONFIG, EXPERIMENTAL_SOURCE_CONFIG),
  },
  {
    slug: LEG_WOHNEN_SOURCE_SLUG,
    name: "LEG Wohnen",
    integrationType: "scrape",
    isActive: true,
    scheduleCron: "*/30 * * * *",
    rateLimitRpm: 6,
    config: withLifecycle(
      {
        city: "Mönchengladbach",
        minRooms: 1,
        maxRooms: 4,
        maxPages: 1,
        itemsPerRun: 25,
        rateLimitMs: 1000,
        maxDetailFetches: 80,
        sitemapIndexPath: "/sitemap.xml",
      },
      REAL_SOURCE_READY_CONFIG,
    ),
  },
  {
    slug: WG_GESUCHT_SOURCE_SLUG,
    name: "WG-Gesucht",
    integrationType: "scrape",
    isActive: false,
    scheduleCron: "*/30 * * * *",
    rateLimitRpm: 5,
    config: withLifecycle(
      {
        city: "Ingolstadt",
        searchPaths: [
          "/wg-zimmer-in-Ingolstadt.65.0.1.0.html",
          "/wohnungen-in-Ingolstadt.65.2.1.0.html",
        ],
        maxPages: 2,
        pageDelayMs: 2000,
      },
      EXPERIMENTAL_SOURCE_CONFIG,
    ),
  },
  {
    slug: WOHNUNGSBOERSE_SOURCE_SLUG,
    name: "Wohnungsboerse.net",
    integrationType: "scrape",
    isActive: false,
    scheduleCron: "*/30 * * * *",
    rateLimitRpm: 4,
    config: withLifecycle(
      {
        baseUrl: "https://www.wohnungsboerse.net",
        healthPath: "/",
        searchPath: "/searches/index",
        city: "Berlin",
        minPrice: 500,
        maxPrice: 1800,
        minRooms: 1,
        maxRooms: 4,
        maxPages: 3,
        pageDelayMs: 2000,
      },
      EXPERIMENTAL_SOURCE_CONFIG,
    ),
  },
];

async function main(): Promise<void> {
  for (const def of SEED_FILTER_DEFINITIONS) {
    await prisma.filterDefinition.upsert({
      where: { key: def.key },
      update: {
        label: def.label,
        dataType: def.dataType,
        operatorSet: [...def.operatorSet],
        config: (def.config ?? {}) as Prisma.InputJsonValue,
        isActive: def.isActive ?? true,
      },
      create: {
        key: def.key,
        label: def.label,
        dataType: def.dataType,
        operatorSet: [...def.operatorSet],
        config: (def.config ?? {}) as Prisma.InputJsonValue,
        isActive: def.isActive ?? true,
      },
    });
  }
  console.log(`Seeded ${SEED_FILTER_DEFINITIONS.length} filter definitions.`);

  for (const source of SEED_SOURCES) {
    await prisma.source.upsert({
      where: { slug: source.slug },
      update: {
        name: source.name,
        integrationType: source.integrationType,
        isActive: source.isActive,
        scheduleCron: source.scheduleCron,
        rateLimitRpm: source.rateLimitRpm,
        config: source.config as Prisma.InputJsonValue,
      },
      create: {
        slug: source.slug,
        name: source.name,
        integrationType: source.integrationType,
        isActive: source.isActive,
        scheduleCron: source.scheduleCron,
        rateLimitRpm: source.rateLimitRpm,
        config: source.config as Prisma.InputJsonValue,
      },
    });
    console.log(`Seeded ${source.slug} source.`);
  }
}

function shouldRunMain(): boolean {
  const entry = process.argv[1]?.replace(/\\/g, "/");
  return (
    entry?.endsWith("/seed.ts") === true || entry?.endsWith("/seed.js") === true
  );
}

if (shouldRunMain()) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
