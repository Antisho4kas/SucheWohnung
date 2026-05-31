# Documentation Validation Report (Stage 2)

Аудит всех 18 разделов + README + `sql/schema.sql`. Документация принята как Single Source of Truth.
Ниже зафиксированы выявленные противоречия и **детерминированные решения**.

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
- Docker daemon в текущем окружении недоступен → код собирается/тестируется напрямую (Node 22). Docker/Compose/K8s/CI артефакты создаются полностью и валидны, но запуск контейнеров демонстрируется через локальный путь.
- Реализуется по roadmap: **Этап 1 (платформа) + Этап 2 (mock + IS24-scaffold коннектор) + Connector SDK (Этап 3 фундамент)**.
