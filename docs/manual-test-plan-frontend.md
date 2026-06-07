# Frontend UI Smoke & Acceptance — Test Plan and Findings (Developer P)

Date: 2026-06-07. Target: deployed stack on staging VPS `217.160.100.134`
(Docker Compose: web/api/bot/workers/nginx/postgres/redis). Tooling: Playwright
MCP browser (no `@playwright/test` harness exists in the repo) + internal API
curl smoke via SSH.

## Summary

The frontend renders correctly and client-side logic works, but **all
backend-connected UI flows are blocked by a deployment misconfiguration**: the
deployed web bundle calls `http://localhost:3000/api/v1` from the browser, which
is unreachable. This must be fixed (build + reverse-proxy config) before the
acceptance flows (auth, profiles, Telegram link, admin, queue/source runs) can
pass through the UI. No frontend source bug was found in the tested flows.

## Environment / Topology (verified)

- `http://217.160.100.134/` (port 80) → nginx → `web:8080` (Next.js app). Serves OK.
- nginx `:3000` → `api:3000`, but host port 3000 is **not reachable externally**
  (firewall); only `:80` is public. The API container itself is alive
  (`api` responds to routed requests; unknown routes return the §8.4 error envelope).
- `suchewohnung-web-1` has **no `NEXT_PUBLIC_*`** env set.

## BLOCKERS (filed — infra/deploy, not frontend source)

### BLOCKER-1 (critical): web cannot reach the API from the browser
- Evidence: on `POST /register` the browser issued
  `POST http://localhost:3000/api/v1/auth/register` → `net::ERR_CONNECTION_REFUSED`;
  UI showed "Failed to fetch". `/dashboard` produced dozens of console errors from
  the same failed calls.
- Root cause: Next.js inlines `NEXT_PUBLIC_*` at **build time**. The web image was
  built without `NEXT_PUBLIC_API_URL`, so `services/web/src/lib/api.ts` fell back to
  `http://localhost:3000/api/v1`. In a real browser `localhost` is the visitor's
  machine, not the server.
- Fix (recommended): expose the API same-origin and build the web with a relative
  base:
  1. Add an nginx `location /api/ { proxy_pass http://api:3000/api/; }` on the `:80`
     server (so the API is reachable at `http://<host>/api/v1/...`).
  2. Build the web image with `NEXT_PUBLIC_API_URL=/api/v1` (build arg / compose
     `build.args` / CI env). Relative base avoids host/port/CORS coupling.
  - Alternative: set `NEXT_PUBLIC_API_URL=http://<public-host>:<public-api-port>/api/v1`
    AND open that port in the firewall AND configure API CORS for the web origin.

### BLOCKER-2 (medium): no public API route on port 80
- Evidence: `POST http://217.160.100.134/api/v1/auth/register` → 404 (served by the
  Next app); host port 3000 unreachable externally.
- Implication: even a corrected `NEXT_PUBLIC_API_URL` pointing at `:3000` would fail
  from external browsers. Resolved by the nginx `/api/` proxy in BLOCKER-1 fix.

## Verified WITHOUT backend (frontend-only, PASS)

- Landing page renders (header, hero, "So funktioniert's", footer), DE/RU toggle present.
- `/register`, `/login` render correctly (desktop 1366×900 and mobile 390×844).
  - Screenshots: `docs/frontend-smoke/mobile-login.png`, `docs/frontend-smoke/mobile-profile-new.png`.
- Client-side validation: mismatched passwords show
  "Die Passwörter stimmen nicht überein." with **no** network call.
- Only non-API console error on public pages is `favicon.ico` 404 (cosmetic).
- `/dashboard` and `/dashboard/profiles/new` render the authenticated shell/sidebar
  responsively; the profile form fields and dashboard data require the API
  (`/filters`, `/profiles`) and could not be exercised due to BLOCKER-1.

## Auth-redirect observation

- Unauthenticated `/dashboard` did **not** redirect to `/login`; it rendered the
  shell and showed "Daten konnten nicht geladen werden." This is likely downstream
  of BLOCKER-1: the API call fails at the network layer (not a 401), so the
  401 → login redirect handler (`setAuthFailureHandler`) never fires. Re-verify the
  unauth redirect after BLOCKER-1 is fixed before treating it as a separate bug.

## API contract smoke (internal, via api container, PASS)

Endpoints the frontend (`services/web/src/lib/api.ts`) calls were exercised
internally and align with the API:

- `POST /auth/register` → 201 `{ "id": "..." }`.
- `POST /auth/login` (unverified user) → 401 `{ error: { code: "UNAUTHENTICATED",
  message: "Email verification required", request_id } }` — confirms the
  verify/pending gate and the §8.4 snake_case error envelope.
- `GET /profiles`, `POST /profiles`, `GET /admin/sources` without a valid token → 401.
- Frontend paths confirmed: current user is `GET /me` (not `/auth/me`); Telegram link
  is `POST /auth/telegram/link` (not `GET /telegram/link`). Admin: `/admin/stats`,
  `/admin/sources`, `/admin/sources/:id/runs`, `/admin/sources/:id/toggle`,
  `/admin/queues`, `/admin/logs`.

## Verification commands run

- `npm run -w @suchewohnung/web build` → success (9 routes built).
- `npm run test:web` → 35/35 passed.
- No Playwright harness in repo; live smoke done via Playwright MCP browser.

## Manual acceptance flows to run AFTER BLOCKER-1/2 are fixed

Desktop (1366×900) and Mobile (390×844):
1. Register → expect "verify pending" UX (login blocked until email verified).
2. Verify email (dev: mark `users.email_verified_at` or use the verification link),
   then Login → redirect to `/dashboard`.
3. Create profile (`/dashboard/profiles/new`): filters render from `/filters`,
   submit → profile appears on dashboard.
4. Edit profile; toggle notify/active; verify PATCH payloads (snake_case
   `is_active`, `notifications_enabled`).
5. View matches (`/dashboard/profiles/:id/matches`).
6. Telegram link screen (`/dashboard/telegram`): `POST /auth/telegram/link` returns
   link/connected; the only acceptable failure is the no-token Telegram case.
7. Admin (admin/super_admin user): `/admin` stats, sources list, source run details,
   queue status (`/admin/queues`), audit logs.
8. Console: no uncaught errors except the documented favicon 404.
9. Network: auth/profile/admin payloads use `/api/v1` and snake_case bodies.

## Status against acceptance criteria

- Core UI flows pass: **BLOCKED** by BLOCKER-1/2 (deploy config) — not reachable yet.
- No frontend/backend contract mismatch: **OK at API level** (endpoints/shapes align);
  full UI contract re-check pending the fix.
- No console errors in tested flows: **frontend-only pages clean** (except favicon);
  backend-connected pages error solely due to BLOCKER-1.
- Mobile layout usable for profile create/edit: shell/nav responsive; **form fields
  pending** API availability.
- Auth/profile/admin smoke automated or documented: **documented** here (no PW harness);
  internal API contract smoke executed.

---

## RESOLUTION & DEPLOY (2026-06-07, authorized)

Both original blockers were fixed in source and deployed to the staging VPS, then
verified live with the Playwright MCP browser.

### Source changes
- `services/web/Dockerfile`: added `ARG/ENV NEXT_PUBLIC_API_URL=/api/v1` before the
  web build (Next.js inlines `NEXT_PUBLIC_*` at build time). Default is same-origin.
- `nginx.conf`: added `location /api/ { proxy_pass http://api:3000/api/; }` on the
  `:80` server so the SPA reaches the backend same-origin.
- `docker-compose.yml`: web `build.args.NEXT_PUBLIC_API_URL=/api/v1` (was a runtime
  env, which is too late for Next).
- `.github/workflows/ci.yml`: pass `NEXT_PUBLIC_API_URL=/api/v1` build-arg so GHCR
  images are correct going forward.
- `services/web/src/app/dashboard/telegram/page.tsx`: NEW page (fixes broken sidebar
  link, see BUG-3).
- `services/web/src/app/admin/page.tsx`: load admin sections with `Promise.allSettled`
  so one failing endpoint no longer blanks the whole panel (see BUG-4).
- `services/web/src/lib/api.ts`: `getAuditLogs` sends an explicit page size (does not
  fix the backend 400; see BLOCKER-3).

### Deploy (VPS)
- nginx: replaced mounted `nginx.conf`, `nginx -t` OK, `nginx -s reload`.
- web: rebuilt image `ghcr.io/antisho4kas/suchewohnung/web:264d9b6` with
  `--build-arg NEXT_PUBLIC_API_URL=/api/v1`, recreated the `web` service.

### Verified live (PASS)
- BLOCKER-1 fixed: browser now `POST http://217.160.100.134/api/v1/auth/register` → **201**.
- BLOCKER-2 fixed: `/api/v1/...` on port 80 routes to the API (login → 401 envelope, not 404).
- Register → "verify pending" UX shown ("Bitte bestätigen Sie Ihre E-Mail").
- Login (verified user) → `/dashboard`; identity + Telegram deep link render.
- Telegram screen `/dashboard/telegram` now renders (was 404).
- Create profile → `POST /profiles` 201, appears on dashboard.
- Toggle active/notify → `PATCH /profiles/:id` 200.
- Admin (`super_admin`): stats (2 users / 5700 listings / 5 matches), all 8 sources
  with health/breaker/lifecycle/metrics + toggles, queue status (collect/match/
  notify/telegram) — all render. Screenshot: `docs/frontend-smoke/admin-panel-fixed.png`.
- Mobile (390×844): login, dashboard, profile form usable.
  Screenshot: `docs/frontend-smoke/mobile-profile-new-fixed.png`.

### Frontend bugs found & fixed (in tested flows)
- BUG-3 (fixed): sidebar "Telegram" link pointed to `/dashboard/telegram`, which did
  not exist → Next 404. Added the page.
- BUG-4 (fixed): admin panel used `Promise.all`; any one failing call (audit logs)
  blanked the entire panel. Now uses `Promise.allSettled`.

### REMAINING BLOCKER (backend — filed, not fixed in this frontend task)
- BLOCKER-3: `GET /api/v1/admin/logs` returns **400**
  `{ code: VALIDATION_ERROR, limit: "expected string, received number" }` for both
  absent and string `limit`. The running api image's compiled
  `AdminLogsQuerySchema` (`z.string().optional().transform(Number).pipe(z.number())`)
  looks correct, so the fault is in the query `ZodValidationPipe` coercion path on the
  backend (the value reaches the schema as a number). Impact: the admin "Letzte
  Aktivitäten" (audit logs) panel stays empty; the rest of the admin panel works due
  to BUG-4 fix. Owner: backend. Recommended: have the query pipe pass raw string query
  values to the schema (the schema already coerces), and add a test for
  `AdminLogsQuerySchema.parse({})` and a request without `limit`.

### Notes / residual
- Telegram deep link uses bot username `SucheWohngBot` (verify this is the intended
  handle vs `SucheWohnungBot`) — configuration, not frontend.
- Transient 401 → token-refresh → retry logs a 401 in console when the 15-min access
  token expires; the refresh recovers it. Not a functional failure.
- Only cosmetic public-page console error remains: `favicon.ico` 404.
- Test users created in staging DB (`dev-p-*`, `probe-*`); `dev-p-fixed-0607` was
  promoted to verified `super_admin` for admin smoke. Remove when no longer needed.
