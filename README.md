# SucheWohnung — Technical Design Document (TDD)

**Проект:** Агрегатор поиска квартир в Германии с уведомлениями в Telegram
**Версия документа:** 1.0
**Дата:** 2026-05-31
**Статус:** Approved for Development
**Авторы:** Solution Architecture Team

---

## О документе

Это полный технический проектный документ (Technical Design Document) для веб‑приложения **SucheWohnung** — системы, которая автоматически собирает объявления о квартирах с немецких сайтов недвижимости, нормализует и дедуплицирует их, сопоставляет с поисковыми профилями пользователей и уведомляет о подходящих вариантах через Telegram.

Документ рассчитан на то, чтобы команда разработки могла начать реализацию **без дополнительных уточнений**. Каждое технологическое решение обосновано; приведены схема БД, API‑контракты, архитектурные диаграммы (Mermaid), DevOps‑конфигурации и поэтапный roadmap по трём этапам из ТЗ.

---

## Структура документации

| № | Раздел | Файл |
|---|--------|------|
| 1 | Executive Summary | [`01-Executive-Summary.md`](./01-Executive-Summary.md) |
| 2 | Business Requirements | [`02-Business-Requirements.md`](./02-Business-Requirements.md) |
| 3 | Functional Requirements | [`03-Functional-Requirements.md`](./03-Functional-Requirements.md) |
| 4 | Non-Functional Requirements | [`04-Non-Functional-Requirements.md`](./04-Non-Functional-Requirements.md) |
| 5 | System Architecture | [`05-System-Architecture.md`](./05-System-Architecture.md) |
| 6 | Technology Stack | [`06-Technology-Stack.md`](./06-Technology-Stack.md) |
| 7 | Database Design | [`07-Database-Design.md`](./07-Database-Design.md) |
| 8 | API Specification | [`08-API-Specification.md`](./08-API-Specification.md) |
| 9 | Integration Architecture (Plugin System) | [`09-Integration-Architecture.md`](./09-Integration-Architecture.md) |
| 10 | Search Engine Logic | [`10-Search-Engine-Logic.md`](./10-Search-Engine-Logic.md) |
| 11 | Telegram Notification System | [`11-Telegram-Notification-System.md`](./11-Telegram-Notification-System.md) |
| 12 | Административная панель (Admin Panel) | [`12-Admin-Panel.md`](./12-Admin-Panel.md) |
| 13 | Security & GDPR Compliance | [`13-Security-GDPR.md`](./13-Security-GDPR.md) |
| 14 | Deployment Architecture (DevOps) | [`14-Deployment-Architecture.md`](./14-Deployment-Architecture.md) |
| 15 | Monitoring & Logging | [`15-Monitoring-Logging.md`](./15-Monitoring-Logging.md) |
| 16 | Development Roadmap | [`16-Development-Roadmap.md`](./16-Development-Roadmap.md) |
| 17 | Risk Analysis | [`17-Risk-Analysis.md`](./17-Risk-Analysis.md) |
| 18 | Future Scaling Strategy | [`18-Future-Scaling-Strategy.md`](./18-Future-Scaling-Strategy.md) |

Дополнительно:
- [`sql/schema.sql`](./sql/schema.sql) — полная DDL‑схема PostgreSQL (таблицы + индексы).
- Все архитектурные диаграммы выполнены в **Mermaid** и встроены прямо в соответствующие разделы (`05`, `07`, `08`, `09`, `10`, `11`, `13`, `14`).

---

## Краткое содержание решения

- **Архитектурный стиль:** модульный монолит на старте → выделение сервисов по мере роста. Ядро + плагины‑коннекторы для источников.
- **Backend:** TypeScript / Node.js 22, Fastify (HTTP API), Prisma ORM, Zod (валидация).
- **Очереди / фоновые задачи:** BullMQ поверх Redis 7 (сбор, матчинг, уведомления, расписания).
- **Frontend / Admin:** React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + TanStack Query.
- **БД:** PostgreSQL 16 + PostGIS (гео‑поиск), Redis 7 (кэш, очереди, rate‑limit). Опционально OpenSearch для full‑text.
- **Сбор данных:** undici + got + cheerio/selectolax (статика), Playwright (динамика/JS), пул прокси.
- **Telegram:** grammY (webhook в проде).
- **Инфраструктура:** Docker + Docker Compose (dev/staging) → Kubernetes (prod), GitHub Actions CI/CD, Prometheus + Grafana + Loki + OpenTelemetry + Sentry.

Полное обоснование стека — в разделе [Technology Stack](./06-Technology-Stack.md).

---

## Соответствие этапам ТЗ

| Этап ТЗ | Где описано |
|---------|-------------|
| **Этап 1** — базовая платформа (auth, профили, бот, уведомления, админка) | §5, §6, §7, §8, §11, §12, §13, §16 |
| **Этап 2** — первый источник (сбор, валидация, дедуп, фильтры, нотификации) | §9, §10, §11, §16 |
| **Этап 3** — масштабирование (plugin‑архитектура, новые парсеры/API‑коннекторы) | §9, §18 |

---

## Соглашения документа

- 🟢 **MUST** — обязательное для MVP · 🟡 **SHOULD** — желательное · 🔵 **MAY** — опциональное / на будущее.
- Диаграммы — в нотации **Mermaid**, встроены в Markdown.

---

## Глоссарий

| Термин | Описание |
|--------|----------|
| **Listing (Объявление)** | Запись о квартире, полученная из источника. |
| **Source (Источник)** | Сайт недвижимости (например, Immobilienscout24). |
| **Connector / Plugin** | Модуль интеграции с конкретным источником (API или Scraper). |
| **Search Profile** | Набор фильтров поиска, заданный пользователем. |
| **Match** | Факт совпадения объявления с поисковым профилем. |
| **Provisionsfrei** | Без комиссии риелтору. |
| **Bundesland** | Федеральная земля Германии. |
| **Dedup** | Дедупликация — устранение дублирующихся объявлений. |
| **Fingerprint** | Хеш‑отпечаток объявления для дедупликации. |
