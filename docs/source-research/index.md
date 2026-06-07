# Source Research Index

This directory records source readiness evidence. Source notes are engineering research, not legal advice or production approval.

## Implemented / Current Sources

Research date: 2026-06-05. Scope: currently implemented or seeded real sources. No live scraping or connector dry-run was run for this pass.

| Source | Slug | Runtime Status | Dry-Run Status | Activation Recommendation | Main Constraint |
| --- | --- | --- | --- | --- | --- |
| [LEG Wohnen](./leg-wohnen.md) | `leg-wohnen` | Registered, **active** | `completed` (2026-06-07) | `ready` (operator-approved primary beta) | Bounded scan (`maxDetailFetches`); legal/ToS sign-off recorded by operator. |
| [WG-Gesucht](./wg-gesucht.md) | `wg-gesucht` | Exported/seeded, not default-registered | `blocked` | `disabled` | `/api/` disallowed; public JSON-LD only; legal/runtime approval missing. |
| [Wohnungsboerse.net](./wohnungsboerse.md) | `wohnungsboerse` | Exported/seeded, not default-registered | `blocked` | `disabled` | Avoid robots-disallowed AJAX/RSS endpoints; legal/runtime approval missing. |
| [Immobilo](./immobilo.md) | `immobilo` | Exported/seeded, not default-registered | `blocked` | `disabled` | Aggregator with high dedupe and upstream legal risk. |
| [Kleinanzeigen](./kleinanzeigen.md) | `kleinanzeigen` | Registered, **active** | `via adapter` | `ready` (operator-approved primary beta) | Reads via self-hosted ebay-kleinanzeigen-api adapter (DanielWTE); operator-approved. |
| [ImmoScout24](./immoscout.md) | `immoscout` | Registered, inactive | `blocked` | `blocked` | Current connector is local/private adapter scaffold; official permission/API evidence missing. |
| [Immowelt](./immowelt.md) | `immowelt` | Registered, inactive | `blocked` | `blocked` | Live public-page scraping lacks legal/dry-run evidence; site returned 403 on HEAD. |

Recommended first beta candidate: `leg-wohnen`, because it is a registered direct-landlord connector using sitemap/detail pages and has the lowest observed dedupe and marketplace-flow risk. It is not ready for activation until legal approval and an approved low-rate dry-run are recorded.

## Direct Landlord Reconnaissance

Research date: 2026-06-02. Scope: TAG Wohnen, GESOBAU, Gewobag, degewo, HOWOGE, Grand City Property, Vonovia, and Deutsche Wohnen. This is technical reconnaissance only; no production connectors were written.

## Summary

| Source | Recommendation | Priority | Confirmed Source Shape | Main Constraint |
| --- | --- | --- | --- | --- |
| GESOBAU | `implement` | P1 | Public search HTML plus public JSON query | Avoid Immomio/application flows |
| Gewobag | `implement` | P1 | Public search HTML, sitemap detail discovery, HTML details | Mixed offer types; no confirmed JSON API |
| degewo | `implement` | P1 | Public server-rendered search and detail pages | Pagination uses `cHash`; parse discovered links |
| Grand City Property | `implement` | P1 | Public sitemap and HTML detail pages | Mixed object types and no stable JSON API |
| Vonovia | `needs permission` | P1 | Public JSON list endpoint | Undocumented API; explicit PDF robot disallow |
| Deutsche Wohnen | `needs permission` | P1 Berlin / P2 national | Public JSON list endpoint | Undocumented shared platform API |
| TAG Wohnen | `needs permission` | P1 if permitted / P3 otherwise | Public page uses structured API | Client-exposed Basic auth and restrictive robots filters |
| HOWOGE | `needs permission` | P2 gated | Public search shell plus JSON list endpoint | Observed JSON feed matches a robots-disallowed parameter pattern |

## Implement First

- [GESOBAU](./gesobau.md)
- [Gewobag](./gewobag.md)
- [degewo](./degewo.md)
- [Grand City Property](./grand-city-property.md)

These sources have public listing pages, useful extractable fields, and no confirmed robot rule blocking the relevant listing paths.

## Needs Permission Before Production

- [Vonovia](./vonovia.md)
- [Deutsche Wohnen](./deutsche-wohnen.md)
- [TAG Wohnen](./tag-wohnen.md)
- [HOWOGE](./howoge.md)

These sources expose useful structured endpoints or feeds, but production use needs explicit permission because the endpoints are undocumented, semi-private, authenticated by client-exposed credentials, or appear robots-restricted.

Each source file includes a dedicated `Anti-Bot / JS Risks` section. Use that section as the crawler-safety checkpoint before any connector implementation.

## Common Guardrails

- Do not automate application, inquiry, search-agent, tenant portal, WBS calculator, contact, or login flows.
- Do not store applicant data or form submissions.
- Normalize German currency and decimal formats carefully.
- Filter mixed offer feeds to apartments before matching or notification.
- Respect `robots.txt` at runtime and re-check before implementation.
- Keep crawling rates low and prefer sitemap/listing pages over exhaustive query generation.
- Treat exact addresses, coordinates, images, and contact fields as sensitive operational data.

## Files

- [LEG Wohnen](./leg-wohnen.md)
- [WG-Gesucht](./wg-gesucht.md)
- [Wohnungsboerse.net](./wohnungsboerse.md)
- [Immobilo](./immobilo.md)
- [Kleinanzeigen](./kleinanzeigen.md)
- [ImmoScout24](./immoscout.md)
- [Immowelt](./immowelt.md)
- [TAG Wohnen](./tag-wohnen.md)
- [GESOBAU](./gesobau.md)
- [Gewobag](./gewobag.md)
- [degewo](./degewo.md)
- [HOWOGE](./howoge.md)
- [Grand City Property](./grand-city-property.md)
- [Vonovia](./vonovia.md)
- [Deutsche Wohnen](./deutsche-wohnen.md)
