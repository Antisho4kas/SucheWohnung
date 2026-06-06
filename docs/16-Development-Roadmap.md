# 16. Development Roadmap

This roadmap reflects the current repository state, not the original idealized sprint plan. Resolved contradictions and canonical decisions are maintained in [`VALIDATION.md`](./VALIDATION.md).

## Current Stage

The project is a pre-production implementation scaffold:

- Monorepo, package structure, Prisma schema/migrations, seed, API, workers, bot, web scaffold, Docker Compose, and tests exist.
- The safe end-to-end development path is `mock` ingestion.
- Several real-source connector implementations exist, but source activation is gated by legal/robots review, fixture coverage, dry-run metrics, and inactive-by-default rollout.
- Direct landlord research under [`source-research/`](./source-research/index.md) is technical reconnaissance only; it is not production connector approval.

## Priority 0 — Documentation And Local Reproducibility

| Task | Definition of Done |
|------|--------------------|
| Keep `README.md` aligned with `VALIDATION.md` | README references `VALIDATION.md` as SSOT for resolved contradictions and does not repeat old Fastify/Vite/role/filter/SLO conflicts. |
| Document actual local commands | Native Node 22 path covers install, Prisma generate/migrate/seed, build, typecheck, tests, API/worker/bot/web startup. |
| Separate supported, inactive, and research-only sources | Runtime-supported connectors, seeded inactive connectors, and research-only landlord sources are documented separately. |
| Maintain source onboarding checklist | New source work has a repeatable legal/robots/test/rollout checklist in [`SOURCE-ONBOARDING.md`](./SOURCE-ONBOARDING.md). |
| Maintain legal/robots policy | Source approval rules are explicit in [`LEGAL-ROBOTS-POLICY.md`](./LEGAL-ROBOTS-POLICY.md). |

## Priority 1 — Platform Stabilization

| Task | Definition of Done |
|------|--------------------|
| Verify native dev bootstrap | Fresh checkout can run `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run build`, and relevant tests with local Postgres/Redis. |
| Keep `mock` E2E path green | Collect → persist listing → match → notification queue flow is covered by tests or an explicit local verification script. |
| Stabilize API/admin basics | Auth, profiles, filters, source admin, and queue/admin endpoints follow `/api/v1`, snake_case JSON, and the error envelope from §08. |
| Stabilize worker operations | `collect`, `match`, `notify`, scheduler, retry/backoff, rate-limit, and DLQ conventions are observable and documented. |
| Keep web/admin runnable | Next.js 14 app starts through the workspace command and points at the API without undocumented setup. |

## Priority 2 — Connector Readiness

| Task | Definition of Done |
|------|--------------------|
| Keep runtime-supported connectors fixture-tested | `mock`, `kleinanzeigen`, `immowelt`, `immoscout`, and `leg-wohnen` have connector tests and documented constraints. |
| Add legal gate metadata to each source | Each non-mock source has a research note or source record that states `approved`, `permission_required`, or `blocked`. |
| Run dry-runs before activation | Each real source has a dry-run report covering fetched count, parse errors, quality-gate rejects, dedupe ratio, HTTP statuses, and request rate. |
| Keep real sources inactive by default | Seeded real sources stay `is_active=false` until explicitly approved and monitored. |
| Promote unregistered implementations deliberately | `wg-gesucht`, `immobilo`, and `wohnungsboerse` are wired into runtime only after the onboarding checklist is complete. |

## Priority 3 — Direct Landlord Sources

| Task | Definition of Done |
|------|--------------------|
| Implement first approved landlord source | Choose from GESOBAU, Gewobag, degewo, or Grand City Property after re-checking robots/ToS and updating source research. |
| Avoid permission-gated feeds until approved | Vonovia, Deutsche Wohnen, TAG Wohnen, and HOWOGE remain blocked from production ingestion unless permission or a legally safe path is documented. |
| Preserve application-flow boundary | Connectors never automate tenant portals, login, applications, inquiry/contact forms, WBS calculators, or CAPTCHA/challenge bypass. |
| Add source-specific monitoring | Per-source success rate, parse errors, schema drift, 403/429 spikes, and last-success timestamp are visible before activation. |

## Priority 4 — Production Readiness

| Task | Definition of Done |
|------|--------------------|
| Secrets and environment hardening | JWT RS256 keys, data encryption key, Telegram secrets, SMTP, and source credentials are documented as environment/secret-manager values only. |
| Observability and alerts | Prometheus/Grafana/Loki/Sentry/OpenTelemetry conventions are deployed or have runnable local/staging equivalents. |
| GDPR workflows | Export/delete/consent paths are implemented or explicitly tracked, with no unnecessary personal data in logs/raw payloads. |
| Deployment runbooks | Native, Docker Compose, and production deployment paths document prerequisites, migrations, health checks, rollback, and known blockers. |
| Security review | Auth, RBAC, rate limits, CSRF/CORS, error envelopes, input validation, and secret handling are reviewed before production exposure. |

## Backlog / Future Scaling

| Task | Definition of Done |
|------|--------------------|
| Connector generator | A documented scaffold can create a new connector with config schema, fixtures, tests, and source metadata. |
| Cross-source dedupe hardening | Aggregator and direct-source duplicates produce a single notification when listing identity is clear. |
| OpenSearch evaluation | Full-text/faceted search is introduced only when PostgreSQL/PostGIS no longer satisfies measured needs. |
| Service extraction | API/worker/bot modules move out of the modular monolith only when load or ownership requires it. |

## Explicit Non-Goals For The Next Milestone

- No new source should be activated in production only because a parser works locally.
- No connector should bypass robots, ToS, login, application flows, CAPTCHA, or anti-bot challenges.
- No new package scripts or infrastructure changes are required by this roadmap.
- No historical doc section should override `VALIDATION.md` when a contradiction is already resolved there.
