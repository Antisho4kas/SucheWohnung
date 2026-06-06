import { PrismaClient } from "@prisma/client";

const EXPECTED_DB_NAME = "suchewohnung_smoke";
const LOCAL_SMOKE_PORT = "55432";
const CI_SMOKE_PORT = "5432";
const CONTAINER_SMOKE_HOST = "postgres-smoke";

function requireSmokeFlag() {
  if (process.env.RUN_DB_REDIS_SMOKE !== "1") {
    throw new Error(
      "RUN_DB_REDIS_SMOKE=1 is required before resetting a smoke database.",
    );
  }
  if (process.env.CONFIRM_SMOKE_DB_RESET !== EXPECTED_DB_NAME) {
    throw new Error(
      `CONFIRM_SMOKE_DB_RESET=${EXPECTED_DB_NAME} is required before resetting the smoke database.`,
    );
  }
}

function readDatabaseUrl() {
  const value = process.env.SMOKE_DATABASE_URL;
  if (!value)
    throw new Error("SMOKE_DATABASE_URL is required for smoke database reset.");
  process.env.DATABASE_URL = value;
  return new URL(value);
}

function normalizeHost(hostname) {
  return hostname.replace(/^\[/u, "").replace(/\]$/u, "");
}

function isAllowedSmokeTarget(url) {
  const hostname = normalizeHost(url.hostname);
  const port = url.port || "5432";
  if (hostname === CONTAINER_SMOKE_HOST && port === CI_SMOKE_PORT) return true;
  if (
    ["localhost", "127.0.0.1", "::1"].includes(hostname) &&
    port === LOCAL_SMOKE_PORT
  ) {
    return true;
  }
  return (
    process.env.CI_SMOKE_DB_IS_EPHEMERAL === "1" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname) &&
    port === CI_SMOKE_PORT
  );
}

function assertSafeDatabaseUrl(url) {
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(
      `Smoke reset only supports PostgreSQL URLs, got ${url.protocol}`,
    );
  }

  if (!isAllowedSmokeTarget(url)) {
    throw new Error(
      `Refusing to reset smoke database on ${url.hostname}:${url.port || "5432"}.`,
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (database !== EXPECTED_DB_NAME) {
    throw new Error(
      `Refusing to reset database "${database}"; expected "${EXPECTED_DB_NAME}".`,
    );
  }
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

async function main() {
  requireSmokeFlag();
  const databaseUrl = readDatabaseUrl();
  assertSafeDatabaseUrl(databaseUrl);

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      'DROP EXTENSION IF EXISTS "postgis" CASCADE',
    );
    await prisma.$executeRawUnsafe(
      'DROP EXTENSION IF EXISTS "pg_trgm" CASCADE',
    );
    await prisma.$executeRawUnsafe('DROP EXTENSION IF EXISTS "citext" CASCADE');
    await prisma.$executeRawUnsafe(
      'DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE',
    );
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');

    if (databaseUrl.username) {
      const user = decodeURIComponent(databaseUrl.username);
      await prisma.$executeRawUnsafe(
        `GRANT USAGE, CREATE ON SCHEMA "public" TO ${quoteIdent(user)}`,
      );
    }

    console.log(
      `Reset smoke database ${databaseUrl.hostname}/${databaseUrl.pathname.replace(/^\//u, "")}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function redact(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+(@)/giu, "$1<redacted>$2")
    .replace(/(redis:\/\/(?:[^:\s/@]+:)?)[^@\s]+(@)/giu, "$1<redacted>$2")
    .replace(/([?&](?:password|token|secret)=)[^&\s]+/giu, "$1<redacted>");
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
