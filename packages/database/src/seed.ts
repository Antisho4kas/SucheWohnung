import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import {
  SEED_FILTER_DEFINITIONS,
  MOCK_SOURCE_SLUG,
  KLEINANZEIGEN_SOURCE_SLUG,
  IMMOWELT_SOURCE_SLUG,
  IMMOSCOUT_SOURCE_SLUG,
} from "@suchewohnung/shared";

/**
 * Seed: base filter_definitions (schema-driven, §10.2) + a demo mock source
 * (§5.7, §7.7) so the platform is end-to-end runnable on Stage 1 with no real
 * source. Idempotent (upsert by unique key).
 */
const prisma = new PrismaClient();

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

  await prisma.source.upsert({
    where: { slug: MOCK_SOURCE_SLUG },
    update: {},
    create: {
      slug: MOCK_SOURCE_SLUG,
      name: "Mock Source (dev)",
      integrationType: "api",
      isActive: true,
      scheduleCron: "*/5 * * * *",
      rateLimitRpm: 120,
      config: { mock: true, itemsPerRun: 25 } as Prisma.InputJsonValue,
    },
  });
  console.log("Seeded mock source.");

  await prisma.source.upsert({
    where: { slug: KLEINANZEIGEN_SOURCE_SLUG },
    update: {},
    create: {
      slug: KLEINANZEIGEN_SOURCE_SLUG,
      name: "eBay Kleinanzeigen",
      integrationType: "scrape",
      isActive: false,
      scheduleCron: "*/15 * * * *",
      rateLimitRpm: 10,
      config: { city: "berlin", minPrice: 0, maxPrice: 2000, minArea: 20, maxArea: 200, minRooms: 1, maxPages: 3 } as Prisma.InputJsonValue,
    },
  });
  console.log("Seeded kleinanzeigen source.");

  await prisma.source.upsert({
    where: { slug: IMMOWELT_SOURCE_SLUG },
    update: {},
    create: {
      slug: IMMOWELT_SOURCE_SLUG,
      name: "Immowelt",
      integrationType: "scrape",
      isActive: false,
      scheduleCron: "*/30 * * * *",
      rateLimitRpm: 5,
      config: { city: "ingolstadt", maxPrice: 800, maxPages: 2 } as Prisma.InputJsonValue,
    },
  });
  console.log("Seeded immowelt source.");

  await prisma.source.upsert({
    where: { slug: IMMOSCOUT_SOURCE_SLUG },
    update: {},
    create: {
      slug: IMMOSCOUT_SOURCE_SLUG,
      name: "Immobilienscout24",
      integrationType: "scrape",
      isActive: false,
      scheduleCron: "*/30 * * * *",
      rateLimitRpm: 5,
      config: { city: "ingolstadt", maxPrice: 800, maxPages: 2 } as Prisma.InputJsonValue,
    },
  });
  console.log("Seeded immoscout source.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
