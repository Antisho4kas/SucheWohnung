# Manual Playwright Test Plan: Profile Creation/Edit Filters

Scope: frontend profile creation/edit UI and frontend API mapping only. Do not modify backend matching, API controllers, or worker code while executing this plan.

## Preconditions

- API is running with Postgres/Redis and seeded `filter_definitions`.
- Web app is running with `NEXT_PUBLIC_API_URL` pointing at `/api/v1` API.
- Test user can log in and reach `/dashboard`.
- Browser devtools/network capture or Playwright network listeners are enabled.

## Create Profile

1. Open `/dashboard/profiles/new` as an authenticated user.
2. Verify the page requests `GET /api/v1/filters` and renders fields from the response labels.
3. Verify bool filters include backend-provided attrs such as `pets_allowed` and `provisionfrei` when those definitions are active.
4. Verify a bool field disappears if the same backend fixture omits that definition.
5. Fill profile name, `city`, `postal_code`, `price_min`, `price_max`, `area_min`, `area_max`, `rooms_min`.
6. Fill radius fields with `lat`, `lng`, and `radius_km`.
7. Enable `pets_allowed` and `provisionfrei`.
8. Submit the form.
9. Inspect `POST /api/v1/profiles` body and verify it contains `filters`, not denormalized UI-only keys.
10. Verify the body contains `{ "key": "location", "operator": "within", "value": { "lat": <number>, "lng": <number>, "radius_km": <number> } }`.
11. Verify the body contains `{ "key": "pets_allowed", "operator": "eq", "value": true }` and `{ "key": "provisionfrei", "operator": "eq", "value": true }`.
12. Verify numeric filters use only operators present in `operator_set` from `filter_definitions`.
13. Verify successful save redirects to `/dashboard` and the profile card still shows legacy summary fields.

## Validation Cases

1. Submit with only a profile name and no filters. Expected: frontend error requiring at least one filter; no `POST /profiles` request.
2. Enter `price_min` greater than `price_max`. Expected: frontend validation error; no `POST /profiles` request.
3. Enter only `radius_km` without `lat`/`lng`. Expected: frontend incomplete-radius error; no `POST /profiles` request.
4. Enter non-numeric text into a numeric field where browser allows it via automation. Expected: frontend validation error; no `POST /profiles` request.

## Edit Profile

1. Open an existing profile at `/dashboard/profiles/:id/edit`.
2. Verify the page requests both profiles and `GET /api/v1/filters`.
3. Verify fields are prefilled from `criteria`, including `criteria.attrs.pets_allowed`, `criteria.attrs.provisionfrei`, and `criteria.location`.
4. Change a numeric bound and toggle a bool attr.
5. Submit the form.
6. Inspect `PATCH /api/v1/profiles/:id` body and verify it contains the rebuilt schema-driven `filters` array.
7. Verify no backend matching, worker, or API-controller behavior is required for this UI test.

## Responsive And Console Checks

1. Run the create flow at desktop viewport, for example `1440x900`.
2. Run the create flow at mobile viewport, for example `390x844`.
3. Check browser console for React/Next errors.
4. Check network panel for unexpected failed frontend requests.
