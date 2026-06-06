# Legal / Robots Policy

This document defines the operating policy for source ingestion. It is an engineering policy, not legal advice. When in doubt, get legal approval and keep the source disabled.

## Principles

- Official APIs, partner feeds, or written permission are preferred over scraping.
- `robots.txt` must be respected at runtime and re-checked before implementation and activation.
- A path not disallowed by robots is not automatically legal permission to collect, store, or reuse data.
- Source ToS, privacy policy, copyright/database rights, anti-circumvention rules, and GDPR constraints must be reviewed for every production source.
- Store links and minimal listing facts needed for matching/notification; do not republish full third-party content when a link is sufficient.

## Hard Stops

Do not build or activate ingestion that requires any of the following without documented explicit permission:

- Login, account, tenant portal, application, inquiry, contact, WBS calculator, payment, or document-download flows.
- CAPTCHA solving, challenge bypass, stealth evasion intended to defeat access controls, or credential/session misuse.
- Robots-disallowed paths or query patterns.
- Undocumented APIs protected by credentials, including credentials exposed in public frontend code.
- Collection of applicant data, form submissions, landlord/private contact details beyond what is needed to link back to the source listing.

## Permission-Gated Sources

Mark a source as `needs permission` when any of these apply:

- The useful data comes primarily from an undocumented JSON endpoint.
- The useful data path is allowed technically but ToS is unclear or restrictive.
- The endpoint requires API keys, Basic auth, cookies, or tokens not granted to this project.
- The endpoint or query pattern appears in `robots.txt` disallow rules.
- Reliable extraction would require browser automation through flows beyond public listing/detail pages.

Production activation is blocked until the permission record is linked from the source research note.

## Runtime Conduct

- Use low-rate polling and source-specific `rateLimitRpm`/delay settings.
- Prefer sitemap and listing/detail pages over exhaustive query generation.
- Use backoff and circuit breakers on errors, especially `403`, `429`, 5xx, CAPTCHA, and challenge pages.
- Identify the crawler honestly through configured user agent where appropriate.
- Never send forms, create accounts, click application/contact buttons, or attempt to reserve/apply for apartments.
- Keep real sources inactive by default until reviewed.

## Data Handling

- Keep raw payload retention limited and operationally justified.
- Treat exact addresses, coordinates, images, contact fields, credentials, and raw source payloads as sensitive operational data.
- Do not log secrets, cookies, authorization headers, Telegram tokens, source credentials, or applicant/contact data.
- Follow GDPR minimization for user data and do not mix user personal data into connector logs or raw source artifacts.

## Current Source Policy Summary

| Source group | Policy |
|--------------|--------|
| `mock` | Safe for local/dev. |
| Runtime-supported real connectors | Inactive by default; require per-source approval before activation. |
| `wg-gesucht`, `immobilo`, `wohnungsboerse` | Implemented/exported but not runtime-supported by default; require onboarding before wiring/activation. |
| GESOBAU, Gewobag, degewo, Grand City Property | Research recommends future implementation, but no production connector exists yet. Re-check robots/ToS first. |
| Vonovia, Deutsche Wohnen, TAG Wohnen, HOWOGE | Permission-gated based on current research. Do not activate without explicit approval. |

## Required Evidence Before Activation

- Source research note updated within the current implementation window.
- Legal/robots status recorded as `approved` or equivalent.
- Dry-run report showing safe request paths, low rate, parse quality, and no application/contact/login automation.
- Monitoring and rollback path identified.
