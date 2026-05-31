# SucheWohnung — Implementation Index (AGENTS.md)

Aggregator for German apartment listings with Telegram notifications.
**Spec is the single source of truth** → `docs/01..18`, `README.md`, `sql/schema.sql`.
Contradiction resolutions are recorded in `docs/VALIDATION.md` (READ FIRST).

## Stack (per §06, contradictions resolved in VALIDATION.md)
- Backend: TypeScript / Node 22, **NestJS 10** (modular monolith), Prisma 5, Zod.
- Queues: BullMQ 5 over Redis 7. Workers: `collect`, `match`, `notify` + `scheduler`.
- Frontend/Admin: **Next.js 14** (App Router) + Tailwind + shadcn/ui + TanStack Query.
- DB: PostgreSQL 16 + PostGIS. Telegram: grammY (webhook in prod).
- Scraping: undici/got + cheerio (cheap path) → Playwright (JS). Obs: Prom/Grafana/Loki/OTel/Sentry.

## Monorepo layout (npm workspaces)
- `packages/shared` — domain model, **Connector Contract (§09)**, **schema-driven filter engine (§10)**,
  fingerprint/dedup (§7.5), quality gate (§9.8), criteria builder, MockConnector. ✅ built + tested (17 tests).
- `packages/database` — Prisma schema mirroring `sql/schema.sql` (§07), migrations
  (`0001_init`, `0002_postgis_geo`), seed (16 filter defs + mock source). ✅ applied to live PostGIS.
- `services/api` — NestJS REST API (§08). ✅ built + linted
- `services/worker` — collect/match/notify/scheduler entrypoints (§05, §09, §10, §11). ✅ built
- `services/bot` — grammY Telegram bot (§11). ✅ built
- `services/web` — Next.js 14 frontend + admin scaffold (§03.5, §12). ✅ built
- `ops/` — Prometheus/Grafana/Loki configs (§15). ✅ created
- `.github/workflows/ci.yml` — CI/CD pipeline (§14). ✅ created
- `docker-compose.yml` — full stack orchestration (§14.2). ✅ created

## Local dev (Docker daemon unavailable here → run natively)
- Postgres 15+PostGIS at localhost:5432 (db `suchewohnung`, user/pass `app`/`app`).
- Redis at localhost:6379.
- Apply DB: `npm run db:migrate` (deploy) ; seed: `npm run db:seed`.
- Tests: `npx vitest run`. Build: `npm run build`.
- `docker-compose.yml` (§14.2) is authoritative for containerized dev/staging.

## Conventions
- Filter keys: `provisionfrei` (not provision_free) — see VALIDATION C4.
- Roles enum: user/premium/admin/super_admin (DDL) — see VALIDATION C3.
- Notify latency SLO p95<60s, hard alert >5min — VALIDATION C5.
- snake_case JSON in API; `/api/v1` prefix; cursor pagination; error envelope per §8.4.
