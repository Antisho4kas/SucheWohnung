# SucheWohnung

**Проект:** агрегатор поиска квартир в Германии с уведомлениями в Telegram
**Текущий статус:** pre-production implementation scaffold, не production-ready
**Актуально на:** 2026-06-04

`README.md` является кратким operational overview. Если README, исторические разделы `docs/01..18` или SQL-артефакты расходятся, решения из [`docs/VALIDATION.md`](./docs/VALIDATION.md) имеют приоритет как single source of truth для resolved contradictions.

## Текущая Стадия

Проект уже не является только TDD: в репозитории есть npm-workspace monorepo, NestJS API, worker services, Telegram bot, Next.js web/admin scaffold, Prisma schema/migrations, seed, Docker Compose и набор тестов.

Практическая стадия сейчас: локально запускаемый pre-production каркас с mock ingestion и несколькими connector implementations. По умолчанию для безопасной разработки активен только `mock`; реальные источники seeded как inactive и требуют отдельной legal/robots проверки перед включением.

Что важно не считать готовым production-фактом:

- Нет production sign-off для scraping источников.
- Direct landlord research в `docs/source-research/` является разведкой, а не списком включенных production connectors.
- Docker/Compose artifacts есть в репозитории, но `docs/VALIDATION.md` фиксирует, что в текущем окружении Docker daemon был недоступен; README не утверждает, что containerized или production deployment был проверен.

## Known Limitations

- Проект не production-ready: нет production deployment sign-off, юридического approval для real-source ingestion и полного operational runbook.
- Только `mock` активен по умолчанию; реальные source rows seeded as inactive и требуют onboarding/legal gate перед включением.
- Runtime-supported connector означает только регистрацию в default collect registry, а не качество production-парсинга или право использовать источник.
- `docs/source-research/` содержит technical reconnaissance; даже рекомендация `implement` означает candidate for onboarding, not production approval.
- Native local development path описан как основной; Docker/full-stack путь задокументирован как available when Docker is available, not as verified in this environment.
- Local dev commands перечисляют существующий documented workflow; они не являются обещанием, что внешние сервисы, secrets, Telegram, source access или production observability уже настроены.

## Документация

| Раздел | Файл |
|--------|------|
| Contradictions / решения | [`docs/VALIDATION.md`](./docs/VALIDATION.md) |
| Executive Summary | [`docs/01-Executive-Summary.md`](./docs/01-Executive-Summary.md) |
| Business Requirements | [`docs/02-Business-Requirements.md`](./docs/02-Business-Requirements.md) |
| Functional Requirements | [`docs/03-Functional-Requirements.md`](./docs/03-Functional-Requirements.md) |
| Non-Functional Requirements | [`docs/04-Non-Functional-Requirements.md`](./docs/04-Non-Functional-Requirements.md) |
| System Architecture | [`docs/05-System-Architecture.md`](./docs/05-System-Architecture.md) |
| Technology Stack | [`docs/06-Technology-Stack.md`](./docs/06-Technology-Stack.md) |
| Database Design | [`docs/07-Database-Design.md`](./docs/07-Database-Design.md) |
| API Specification | [`docs/08-API-Specification.md`](./docs/08-API-Specification.md) |
| Connector Architecture | [`docs/09-Integration-Architecture.md`](./docs/09-Integration-Architecture.md) |
| Search / Matching | [`docs/10-Search-Engine-Logic.md`](./docs/10-Search-Engine-Logic.md) |
| Telegram Notifications | [`docs/11-Telegram-Notification-System.md`](./docs/11-Telegram-Notification-System.md) |
| Admin Panel | [`docs/12-Admin-Panel.md`](./docs/12-Admin-Panel.md) |
| Security / GDPR | [`docs/13-Security-GDPR.md`](./docs/13-Security-GDPR.md) |
| Deployment | [`docs/14-Deployment-Architecture.md`](./docs/14-Deployment-Architecture.md) |
| Monitoring | [`docs/15-Monitoring-Logging.md`](./docs/15-Monitoring-Logging.md) |
| Current Roadmap | [`docs/16-Development-Roadmap.md`](./docs/16-Development-Roadmap.md) |
| Risk Analysis | [`docs/17-Risk-Analysis.md`](./docs/17-Risk-Analysis.md) |
| Future Scaling | [`docs/18-Future-Scaling-Strategy.md`](./docs/18-Future-Scaling-Strategy.md) |
| Source onboarding checklist | [`docs/SOURCE-ONBOARDING.md`](./docs/SOURCE-ONBOARDING.md) |
| Legal / robots policy | [`docs/LEGAL-ROBOTS-POLICY.md`](./docs/LEGAL-ROBOTS-POLICY.md) |
| Direct landlord research | [`docs/source-research/index.md`](./docs/source-research/index.md) |
| SQL DDL | [`sql/schema.sql`](./sql/schema.sql) |

## Актуальный Стек

Resolved stack decisions are in [`docs/VALIDATION.md`](./docs/VALIDATION.md):

- Backend: TypeScript / Node 22, NestJS 10, Prisma 5, Zod.
- Workers: BullMQ 5 over Redis 7 with `collect`, `match`, `notify` queues plus scheduler/DLQ conventions.
- Frontend/Admin: Next.js 14 App Router, React 18, Tailwind, shadcn/ui, TanStack Query.
- Database: PostgreSQL 16 + PostGIS.
- Telegram: grammY.
- Scraping/ingestion: connector SDK with HTTP/Cheerio cheap path first and optional Playwright/browser path where legally and technically allowed.
- Observability target: Prometheus, Grafana, Loki, OpenTelemetry/Tempo, Sentry.

## Supported Connectors

Supported here means implemented in the current repository and available to the runtime collector without additional code changes. It does not mean production/legal approval.

| Slug | Runtime support | Seed state | Notes |
|------|-----------------|------------|-------|
| `mock` | Supported and registered | active | Safe synthetic source for local/dev end-to-end flows. |
| `kleinanzeigen` | Supported and registered | inactive | Uses the local Kleinanzeigen adapter shape from current code/config; production use needs legal/robots approval. |
| `immowelt` | Supported and registered | inactive | HTML/embedded-data scraper implementation; production use needs source-specific approval and monitoring. |
| `immoscout` | Supported and registered | inactive | Current implementation targets a local adapter/scaffold, not an official production partnership. Treat as permission-gated. |
| `leg-wohnen` | Supported and registered | inactive | Public sitemap/detail-page connector implementation; still requires robots/ToS re-check before activation. |

Implemented but not runtime-supported by the default collector registry:

| Slug | Current status | Notes |
|------|----------------|-------|
| `wg-gesucht` | Exported and seeded inactive, not registered in `collect` default registry | Requires explicit runtime wiring and legal/robots gate before use. |
| `immobilo` | Exported and seeded inactive, not registered in `collect` default registry | Aggregator source with high cross-source dedupe risk. |
| `wohnungsboerse` | Exported and seeded inactive, not registered in `collect` default registry | Public HTML connector implementation; requires explicit runtime wiring. |

Research-only sources from `docs/source-research/`:

| Source | Status |
|--------|--------|
| GESOBAU, Gewobag, degewo, Grand City Property | Recommended for future implementation after source onboarding. No production connector exists yet. |
| Vonovia, Deutsche Wohnen, TAG Wohnen, HOWOGE | Permission-gated. No production connector exists yet. |

## Local Development

Prerequisites: Node 22, npm, PostgreSQL with PostGIS, Redis. For native development, ensure `.env` uses localhost endpoints instead of Docker service names:

```env
DATABASE_URL=postgresql://app:app@localhost:5432/suchewohnung?schema=public
REDIS_URL=redis://localhost:6379
```

Common commands:

| Purpose | Command |
|---------|---------|
| Install dependencies | `npm ci` |
| Generate Prisma client | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Seed filters and sources | `npm run db:seed` |
| Build all workspaces | `npm run build` |
| Typecheck | `npm run typecheck` |
| Run all Vitest tests | `npm test` |
| Run connector tests | `npm run test:connectors` |
| Run API tests | `npm run test:api` |
| Run worker from TS | `npm run dev:worker` |
| Run API from built `dist` | `npm run dev:api` |
| Run bot from built `dist` | `npm run dev:bot` |
| Run web app | `npm run -w @suchewohnung/web dev` |

Docker path when Docker is available:

| Purpose | Command |
|---------|---------|
| Start only dependencies | `docker compose up -d postgres redis` |
| Start full compose stack | `docker compose up --build` |
| Validate compose config | `docker compose config --quiet` |

Docker compose host ports:

| Service | Host port | Notes |
|---------|-----------|-------|
| PostgreSQL/PostGIS | `127.0.0.1:5432` | Local database only. |
| Redis | `127.0.0.1:6379` | Local queue/cache only. |
| API direct | `127.0.0.1:3001` | Maps to API container port `3000`; avoids the nginx API proxy port. |
| nginx web | `127.0.0.1:80` | Proxies to the Next.js web service. |
| nginx API proxy | `127.0.0.1:3000` | Proxies to the API service inside compose. |
| Kleinanzeigen adapter | `127.0.0.1:8000` | Local adapter service. |
| immo-api adapter | `127.0.0.1:8001` | Local Python/Playwright adapter service. |

Notes:

- Docker build contexts are filtered by root `.dockerignore`; the service-local `services/immo-api/.dockerignore` covers the `./services/immo-api` build context.
- Base `docker-compose.yml` does not load `.env`; it uses non-secret local smoke defaults so `docker compose config --quiet` can validate without rendering real secrets.
- Do not paste full `docker compose config` output from a shell or override that loads real runtime secrets; use `--quiet` for validation.
- The Telegram bot is behind the `telegram` profile and still requires a token supplied through an uncommitted local override or secret manager before use.
- `services/api` and `services/bot` dev scripts run `node dist/main.js`, so run `npm run build` first or use service-specific development changes knowingly.
- The root package currently exposes `dev:api`, `dev:worker`, and `dev:bot`; web dev is run through the workspace command shown above.
- Telegram flows require `TELEGRAM_BOT_TOKEN`; webhook mode also requires `TELEGRAM_WEBHOOK_URL` and `TELEGRAM_WEBHOOK_SECRET`.

## Source Onboarding

Every new source must pass the full checklist in [`docs/SOURCE-ONBOARDING.md`](./docs/SOURCE-ONBOARDING.md) before it is activated beyond local tests.

Minimum gate:

- Create or update a `docs/source-research/<slug>.md` research note.
- Check official API/partner options before scraping.
- Re-check `robots.txt`, ToS, sitemap/listing/detail URL shapes, and anti-bot behavior.
- Mark sources as `permission_required` when APIs are undocumented, authenticated by client-exposed credentials, blocked by robots, or tied to login/application/contact flows.
- Add fixture-based connector tests and keep new sources inactive by default until dry-run metrics are reviewed.

## Legal / Robots Policy

The policy is documented in [`docs/LEGAL-ROBOTS-POLICY.md`](./docs/LEGAL-ROBOTS-POLICY.md). Short version:

- Prefer official APIs and written permission over scraping.
- Respect `robots.txt` and source ToS; robots allowance is not legal permission by itself.
- Do not automate login, tenant portals, application flows, inquiry/contact forms, WBS calculators, or CAPTCHA/challenge bypass.
- Use low-rate polling, backoff on `403`/`429`, source-level circuit breakers, and clear source ownership.
- Store only the listing facts needed for matching/notification; treat exact addresses, contacts, images, and raw payloads as sensitive operational data.

## Roadmap Snapshot

The active roadmap is task-based and maintained in [`docs/16-Development-Roadmap.md`](./docs/16-Development-Roadmap.md). Current priorities:

1. Keep documentation, `VALIDATION.md`, local commands, and source status aligned with the actual repo.
2. Keep the native local dev path reproducible: install, migrate, seed, build, test, run API/worker/web.
3. Stabilize runtime-supported connectors with legal gates, fixtures, dry-run metrics, and inactive-by-default rollout.
4. Promote direct landlord sources from research to connectors only after source onboarding and legal/robots approval.
5. Complete production readiness: secrets, observability, alerts, admin operations, GDPR flows, deployment runbooks.

## Glossary

| Term | Meaning |
|------|---------|
| Listing | Normalized apartment record collected from a source. |
| Source | External website/API/feed represented by a row in `sources`. |
| Connector | `SourceConnector` implementation for one source shape. |
| Runtime-supported connector | Connector registered in the default collect worker registry. |
| Active source | Source with `is_active=true`; only `mock` is active by default in seed. |
| Search Profile | User-defined filter set for matching listings. |
| Match | A listing/profile match eligible for notification. |
| `provisionfrei` | Canonical filter/attribute key for commission-free listings. |
| Fingerprint | Stable dedupe hash for listing identity. |
