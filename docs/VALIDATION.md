# Documentation Validation Report

Аудит всех 18 разделов + README + `sql/schema.sql`. Этот файл является single source of truth для already resolved contradictions. Если исторические разделы `docs/01..18`, README или SQL-артефакты расходятся по пунктам ниже, решение в этом файле имеет приоритет.

README обновлен как operational overview и должен ссылаться сюда вместо повторного разрешения этих конфликтов.

## Разрешение противоречий

| # | Противоречие | Источники | Решение | Обоснование |
|---|--------------|-----------|---------|-------------|
| C1 | Backend: README summary → **Fastify**; §06 → **NestJS 10** | README, §06.1, §05.2, §08.8 (`@nestjs/swagger`) | **NestJS 10** | Детальный нормативный §06 + диаграммы §05 + API §08 единогласно за NestJS. README — сводка, уступает спецификации. |
| C2 | Frontend: README → **Vite SPA**; §06 → **Next.js 14** | README, §06.1, §05.2, §12.8 | **Next.js 14 (App Router)** | Те же причины, что C1. |
| C3 | Роли: §03/§07 → `user/premium/admin/super_admin`; §13/§12 → `user/support/admin` | §03, §07 (DDL `user_role`), §13.1 | **`user/premium/admin/super_admin`** | DDL — исполняемый артефакт + согласуется с FR-AUTH-7. `support` = алиас admin без write-доступа к секретам. |
| C4 | Filter key: §08/§10 → `provisionfrei`; §03 → `provision_free` | §03.2.1, §08.6, §10.2 | seed-ключ **`provisionfrei`** в `listings.attributes` | §10 (нормативно для матчинга) + §08 пример. |
| C5 | Notify SLO: §01/§04 → `< 5 мин`; §15.6 → `p95 < 60 c` | §01.5, §04.3, §15.6 | SLO **p95 < 60 c**, hard-alert при **> 5 мин** | §15 — нормативный раздел мониторинга. |
| C6 | Имена очередей: §14 → `worker-collect`; §12 → `collect, match, notify` | §05.2, §12.5, §14.2 | **`collect`, `match`, `notify`** (+ DLQ) | §12 (Admin) + §14 (compose) совпадают. |

## Проверка целостности (passed)
- ERD ↔ DDL: 14 таблиц + связи согласованы. ✅
- API ↔ БД: все ресурсы имеют таблицы. ✅
- BR-1..BR-8 реализуемы: BR-1/2 → `matches` UNIQUE + `notifications.dedupe_key` UNIQUE; BR-3 → лимит профилей (конфиг); BR-5 → `listing_status`; BR-7 → `sources.breaker_state`; BR-8 → `telegram_subscriptions UNIQUE(user_id, chat_id)`. ✅
- Schema-driven filters (FR-FILT-3) ↔ `filter_definitions` + `profile_filters` (EAV) + `criteria` JSONB. ✅

## Среда реализации
- Docker daemon в текущем окружении недоступен → основной documented путь разработки: native Node 22 + локальные Postgres/Redis. Docker/Compose/K8s/CI артефакты есть в репозитории, но этот файл не утверждает, что containerized или production deployment был проверен в текущем окружении.
- Текущая стадия проекта: **pre-production implementation scaffold**. Есть monorepo, NestJS API, workers, bot, Next.js web/admin scaffold, Prisma schema/migrations/seed, Docker Compose, connector SDK and tests. Production activation of real sources is not approved by default.

## Known limitations

- Не production-ready: нет production deployment sign-off, source legal approval и полного operational runbook.
- `mock` — единственный active-by-default source.
- Runtime-supported real connectors are inactive by default and still require onboarding/legal approval before activation.
- `docs/source-research/` is reconnaissance only; it does not create production connector support or approval.
- Local dev commands document the intended workflow, not availability of external secrets, Telegram credentials, live source access, Docker daemon, or production observability.

## Canonical implementation status

- Runtime-supported connectors in the default collect worker registry: `mock`, `kleinanzeigen`, `immowelt`, `immoscout`, `leg-wohnen`.
- Active by default in seed: `mock` only.
- Seeded/exported but not runtime-supported by the default collect registry: `wg-gesucht`, `immobilo`, `wohnungsboerse`.
- Research-only direct landlord sources: see [`source-research/index.md`](./source-research/index.md). No production connector was written for those research notes.
- Source activation gate: follow [`SOURCE-ONBOARDING.md`](./SOURCE-ONBOARDING.md) and [`LEGAL-ROBOTS-POLICY.md`](./LEGAL-ROBOTS-POLICY.md). Robots allowance alone is not production/legal approval.

## Canonical local dev commands

- Install: `npm ci`.
- Prisma: `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`.
- Verification: `npm run build`, `npm run typecheck`, `npm test`, `npm run test:connectors`.
- Native services: `npm run dev:worker`, `npm run dev:api`, `npm run dev:bot`, `npm run -w @suchewohnung/web dev`.
- Docker path when available: `docker compose up -d postgres redis` for dependencies or `docker compose up --build` for the full stack.
