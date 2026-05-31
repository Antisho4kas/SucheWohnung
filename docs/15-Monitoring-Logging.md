# 15. Monitoring & Logging

## 14.1 Observability stack

| Сигнал | Инструмент |
|--------|-----------|
| Метрики | **Prometheus** + **Grafana** (дашборды) |
| Логи | **Loki** (агрегация), структурированный JSON (pino) с `correlation_id` |
| Трейсинг | **OpenTelemetry → Tempo/Jaeger** (распределённые трейсы API↔воркеры) |
| Алертинг | **Alertmanager** → Telegram/email/PagerDuty |
| Error tracking | **Sentry** (исключения, релизы) |
| Uptime | Внешний синтетический мониторинг (healthcheck‑эндпоинты) |

## 14.2 Логирование

- Структурированный JSON, обязательные поля: `ts, level, service, correlation_id, user_id?, source_id?, msg`.
- `correlation_id` пробрасывается из API через очередь в воркеры (сквозная трассировка запроса/задачи).
- Уровни: `debug` (dev), `info`, `warn`, `error`. ПД не логируются (маскирование email/токенов).
- Аудит действий админов и пользователей — в таблицу `audit_logs` (см. БД), отдельно от технических логов.
- Retention: технические 30 дн, аудит — 1 год, логи с потенциальными ПД — 90 дн.

## 14.3 Ключевые метрики

**Системные/прикладные:**
- `http_request_duration_seconds` (p50/p95/p99), RPS, 5xx‑rate.
- `queue_depth{queue}` — длина очередей collect/match/notify (триггер автоскейла).
- `job_duration_seconds{type}`, `job_failures_total`.

**Доменные (бизнес/парсинг):**
- `listings_ingested_total{source}` — приток объявлений по источнику.
- `source_success_rate{source}`, `source_last_success_timestamp` — здоровье коннектора.
- `parse_errors_total{source}`, `schema_drift_total{source}` — деградация скрейпера.
- `dedup_ratio{source}` — доля дубликатов.
- `notifications_sent_total`, `notifications_failed_total`, `notify_latency_seconds` (от находки до доставки).
- `match_rate` — совпадений на 1000 объявлений.

## 14.4 Алертинг (примеры правил)

| Алерт | Условие | Severity |
|-------|---------|----------|
| Source down | `source_last_success_timestamp` старше 3× интервала планировщика | High |
| Parser drift | `parse_errors_total{source}` рост > 20% за 1 ч | High |
| Queue backlog | `queue_depth{notify} > 5000` 10 мин | High |
| API errors | 5xx‑rate > 2% 5 мин | Critical |
| DB | CPU > 85% / свободное место < 15% | Critical |
| Notify latency | p95 от находки до доставки > 5 мин | Medium |
| Proxy ban spike | `http_status{code=403/429}` всплеск | High |

## 14.5 Дашборды Grafana

1. **Overview** — RPS, latency, error budget, uptime.
2. **Ingestion** — приток по источникам, success rate, дубликаты, дрейф.
3. **Queues & Workers** — глубина очередей, throughput, фейлы, DLQ.
4. **Notifications** — отправлено/ошибки/латентность, заблокировавшие бота.
5. **Business** — активные пользователи, профили, матчи/день.

## 14.6 SLO

- Доступность API: **99.9%**.
- Латентность находка→уведомление: **p95 < 60 c**.
- Error budget трекается; превышение → заморозка фич, фокус на надёжности.
