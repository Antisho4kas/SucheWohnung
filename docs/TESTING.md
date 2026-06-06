# Testing Infrastructure

This document records the test and release-gate conventions for the current monorepo. CI must fail on release-critical test, schema, supply-chain, build, or Docker packaging regressions.

## Commands

- `npm test` runs the full default Vitest suite across `packages/**/src/**/*.test.ts` and `services/**/src/**/*.test.ts`.
- `npm run test:unit` runs the CI Vitest config without coverage output; it includes the same full test file set as `ci:test`.
- `npm run test:api` runs API unit/contract specs, including admin, auth, config, DTO, profile-service, error-envelope, and Telegram webhook module tests.
- `npm run test:api:e2e` runs mocked Nest e2e smoke/security/profile tests without real Postgres or Redis.
- `npm run test:web` runs web adapter infrastructure, web adapter contract, and `ProfileForm` component tests.
- `npm run test:connectors` runs connector fixture and connector contract tests.
- `npm run test:integration` runs the opt-in DB/Redis release smoke when `RUN_DB_REDIS_SMOKE=1` is set.
- `npm run test:coverage` writes `coverage/coverage-summary.json` and `coverage/lcov.info` and enforces coverage thresholds.
- `npm run test:release-contracts` runs the release-critical contract/security specs that previously lived in the stale known-failures split.
- `npm run ci:test` is the CI test gate and currently aliases `npm run test:coverage`.
- `npm run ci:supply-chain` runs `npm audit --audit-level=high`, `license:check`, and `sbom:generate`.
- `npm run license:check` fails if installed production package licenses in `package-lock.json` match AGPL, GPL, LGPL, or SSPL outside the documented allowlist.
- `npm run sbom:generate` writes a CycloneDX SBOM to `sbom.cdx.json` using `npm sbom --sbom-format=cyclonedx --omit=dev`.
- `npm run smoke:release` runs the DB/Redis release smoke against an already running disposable Postgres/PostGIS + Redis.
- `npm run smoke:release:compose` starts isolated `postgres-smoke`/`redis-smoke` services, then runs the same release smoke.

## CI Gates

The GitHub Actions CI workflow runs these release-critical gates on pull requests and pushes to `main`:

- `npm ci` for lockfile-consistent installs.
- `npm run ci:supply-chain` for high-severity audit, denied-license check, and CycloneDX SBOM generation.
- `npm run db:generate` for Prisma client generation.
- `node scripts/reset-smoke-db.mjs` against the ephemeral `suchewohnung_smoke` PostGIS service database.
- `npm run db:migrate` on the clean PostGIS database.
- `npm run db:seed` twice, so the seed must work and remain idempotent enough for release smoke usage.
- `npm run ci:test` for full Vitest coverage with enforced thresholds.
- `npm run test:integration` for real Postgres/Redis worker smoke with mocked Telegram delivery.
- `npm run lint`.
- `npm run typecheck`.
- `npm run build`.
- `docker compose config --quiet`.
- `DB_PASSWORD=ci-placeholder docker compose -f docker-compose.prod.yml config --quiet`.
- Docker builds for `api`, `web`, `worker`, and `bot`; PR builds do not push and do not get package-write permission, `main` pushes to GHCR.

CI uploads these artifacts when available:

- `coverage/` as `coverage`.
- `sbom.cdx.json` as `sbom-cyclonedx`.

## Coverage Thresholds

`vitest.ci.config.ts` enforces realistic thresholds based on the current full CI suite baseline:

- Global: statements `65`, branches `55`, functions `65`, lines `68`.
- `packages/shared/src/**/*.ts`: statements `80`, branches `70`, functions `82`, lines `82`.
- `services/web/src/lib/api.ts`: statements `80`, branches `70`, functions `80`, lines `80`.
- `services/web/src/components/ProfileForm.tsx`: statements `35`, branches `35`, functions `35`, lines `35`.

These thresholds intentionally sit below the current measured baseline so normal report noise does not fail CI, but any meaningful coverage regression will fail `npm run ci:test`. The `ProfileForm.tsx` threshold is low because the current component coverage baseline is low; it is still included so coverage cannot drop silently. Raise thresholds when feature owners add coverage; do not lower them to hide regressions.

## Supply Chain Gates

- `npm audit --audit-level=high` is mandatory in CI. A high or critical advisory must be fixed by dependency owners or explicitly handled in a reviewed dependency/security change; do not bypass the gate in CI.
- `license:check` blocks AGPL, GPL, LGPL, and SSPL production dependencies from the installed lockfile unless they match the explicit denied-license allowlist in `package.json`.
- `license:check` also blocks missing production dependency license metadata unless the package matches the explicit missing-license allowlist in `package.json`.
- Current license allowlist: `node_modules/@img/sharp*` packages from Next.js/sharp image optimization. These packages include LGPL libvips optional binaries; keep this exception only while the project accepts the sharp/libvips license model.
- Current missing-license allowlist: private `@suchewohnung/*` workspace packages plus `busboy`, `passport-strategy`, `pause`, and `streamsearch` from the existing lockfile.
- Any new license exception requires project/legal approval and a deliberate update to the documented policy, not a silent CI bypass.
- `sbom:generate` creates a CycloneDX SBOM for release traceability. The generated `sbom.cdx.json` is a CI artifact and should not be committed as a stale snapshot.

## Release-Only Checks

- Image vulnerability scanning is release-only/manual for now. Use the registry/image scanner available in the release environment, for example Trivy, Docker Scout, or GHCR/Dependabot container scanning, against the built `api`, `web`, `worker`, and `bot` images.
- Image scan results should block release on critical exploitable findings. CI already proves the images build and Compose files parse, but it does not currently run an image scanner.
- Production deployment smoke remains outside default CI because it requires production/staging credentials and operational sign-off.

## Worker Harness

- Worker tests must not connect to real Redis, BullMQ, Telegram, or Postgres unless they are in the explicit DB/Redis release smoke.
- Reuse `services/worker/src/test/bullmq-harness.ts` for BullMQ-like queue, Redis, and job mocks.
- Reuse `services/worker/src/test/collect-harness.ts` for collect pipeline in-memory Prisma state.
- For workers with dependency injection (`runCollectJob`, `runNotifyJob`, scheduler functions), pass explicit mocked dependencies.
- For modules with import-time `Queue`, `Worker`, Redis, or Prisma, register `vi.mock(...)` before importing the worker module.
- New non-release-critical worker behavior gaps may be added as `it.todo(...)` or documented here unless the task is explicitly a feature fix.
- Do not convert an existing failing release-critical assertion into `it.todo`; release-critical regressions must stay visible in CI.

## DB/Redis Release Smoke

- Purpose: prove a clean PostgreSQL/PostGIS database can run `db:migrate`, `db:seed`, repeat `db:seed`, and execute `collect -> match -> notify` through real BullMQ queues on Redis.
- One-command local run with Docker daemon available: `npm run smoke:release:compose`.
- Manual dependency startup: `npm run smoke:deps`, then run `npm run smoke:release` with `CONFIRM_SMOKE_DB_RESET=suchewohnung_smoke` in the environment.
- Default smoke endpoints are `postgresql://app:app@localhost:55432/suchewohnung_smoke?schema=public` and `redis://localhost:56379`.
- The smoke uses `SMOKE_DATABASE_URL`/`SMOKE_REDIS_URL`; the wrapper maps them to `DATABASE_URL`/`REDIS_URL` after setting `RUN_DB_REDIS_SMOKE=1`.
- The reset is destructive inside the disposable smoke DB: it drops PostGIS/pg_trgm/citext/uuid-ossp extensions and `public` schema before `prisma migrate deploy`.
- The DB reset requires `CONFIRM_SMOKE_DB_RESET=suchewohnung_smoke` and refuses any database name other than `suchewohnung_smoke`.
- The smoke refuses Redis targets except `localhost:56379`, `127.0.0.1:56379`, `redis-smoke:6379`, or explicit CI ephemeral service containers.
- BullMQ uses a per-run prefix, so the smoke does not obliterate shared `collect`, `match`, or `notify` queue namespaces.
- Covered DB tables: `sources`, `filter_definitions`, `users`, `search_profiles`, `profile_filters`, `telegram_subscriptions`, `listings`, `source_runs`, `matches`, `notifications`.
- Covered Redis queues: `collect`, `match`, `notify`.
- Telegram delivery is not live: the notify worker uses a test Telegram API stub and records a failed permanent-delivery notification without contacting Telegram.
- CI runs the smoke with `postgis/postgis:16-3.4` and `redis:7-alpine` service containers.

## API E2E Harness

- API e2e specs live under `services/api/src/**/*.e2e.test.ts`.
- Use `services/api/src/test/api-e2e-harness.ts`.
- The harness overrides `PrismaService`, `QueueService`, and `TelegramUpdateProcessorService` with mocks.
- Do not add real Postgres or Redis dependencies to default e2e tests.
- Apply the same global error filter and Zod validation pipe used by production bootstrap where relevant.

## Connector Fixtures

- Fixture files live under `packages/shared/src/connectors/__tests__/fixtures/`.
- Fixture names should use `<connector>-<surface>.<html|xml|json|ts>`.
- Connector tests must use local fixtures and mocked `ConnectorContext.http`; no live network calls.
- Tests should assert normalized `NormalizedListing` fields and connector-contract behavior, not broad snapshots.
- Use project filter keys from `docs/VALIDATION.md`, especially `provisionfrei`.
- Add missing non-release-critical provider behavior as `it.todo(...)` when it requires connector production changes.
- Do not convert an existing failing connector contract or security assertion into `it.todo` to make CI green.

## Former Known-Failures Split

- The stale `test:known-failures` command and `vitest.known-failures.config.ts` have been removed.
- Specs that now pass are included in normal suites and CI.
- Use `npm run test:release-contracts` only as a targeted local shortcut before editing release-critical API security, Telegram webhook, web adapter, or profile form behavior.
- Do not move failing release-critical specs out of CI to make the pipeline green.
