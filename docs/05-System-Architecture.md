# 5. System Architecture

## 5.1 Архитектурный стиль

Система построена как **модульный сервис‑ориентированный монолит на старте, эволюционирующий в набор сервисов** (modular monolith → services). Это сознательный компромисс:

- На Этапе 1–2 команда мала, источников немного → **модульный монолит** даёт скорость разработки, простоту деплоя и отладки.
- Тяжёлая и непредсказуемая по нагрузке часть (сбор данных) **с самого начала вынесена в отдельные воркеры**, связанные с ядром через очередь задач. Это даёт независимое масштабирование самой «дорогой» части без преждевременного дробления всего на микросервисы.
- Границы модулей (auth, profiles, ingestion, matching, notifications, admin) спроектированы так, что любой модуль можно выделить в отдельный сервис без переписывания (чистые интерфейсы, общение через очередь/события).

> **ADR-001:** Modular Monolith + асинхронные воркеры вместо «полных» микросервисов на старте — минимизирует операционную сложность при сохранении пути к масштабированию.

## 5.2 Высокоуровневая архитектура (C4 — Context / Container)

```mermaid
graph TB
    User([Пользователь])
    Admin([Администратор])
    TG[[Telegram Platform]]
    SRC[(Порталы недвижимости<br/>ImmoScout24, Immowelt, ...)]

    subgraph Edge["Edge / Gateway"]
        LB[Load Balancer / Reverse Proxy<br/>Traefik / Nginx]
    end

    subgraph App["Application Layer"]
        WEB[Web Frontend<br/>Next.js SPA/SSR]
        API[Core API<br/>NestJS REST]
        BOT[Telegram Bot Service<br/>grammY]
    end

    subgraph Workers["Async Workers"]
        SCHED[Scheduler<br/>BullMQ repeatable]
        ING[Ingestion Workers<br/>per-source]
        MATCH[Matching Workers]
        NOTIF[Notification Workers]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL<br/>+ PostGIS)]
        REDIS[(Redis<br/>queues + cache)]
        OS[(OpenSearch<br/>опц. полнотекст/гео)]
        S3[(Object Storage<br/>фото, бэкапы)]
    end

    subgraph Obs["Observability"]
        PROM[Prometheus]
        GRAF[Grafana]
        LOKI[Loki]
        OTEL[OTel Collector]
    end

    User -->|HTTPS| LB --> WEB
    Admin -->|HTTPS| LB
    WEB -->|REST /api| API
    User <-->|messages| TG <--> BOT

    API --> PG
    API --> REDIS
    BOT --> PG
    BOT --> REDIS

    SCHED -->|enqueue fetch jobs| REDIS
    REDIS --> ING
    ING -->|HTTP/Headless| SRC
    ING --> PG
    ING --> S3
    ING -->|new/changed events| REDIS
    REDIS --> MATCH
    MATCH --> PG
    MATCH -->|match events| REDIS
    REDIS --> NOTIF
    NOTIF --> BOT
    NOTIF --> PG

    API -.metrics.-> PROM
    ING -.metrics.-> PROM
    PROM --> GRAF
    API -.logs.-> LOKI
    ING -.logs.-> LOKI
    OTEL --> GRAF
```

## 5.3 Логические модули ядра (Component View)

```mermaid
graph TB
    subgraph Core["Core API (NestJS modules)"]
        AUTH[AuthModule<br/>JWT, роли, Telegram link]
        USERS[UsersModule]
        PROFILES[SearchProfilesModule<br/>фильтры, валидация]
        LISTINGS[ListingsModule<br/>чтение/история]
        MATCHAPI[MatchModule]
        NOTIFAPI[NotificationModule<br/>шаблоны, подписки]
        ADMINM[AdminModule]
        SOURCES[SourcesModule<br/>реестр источников]
        FILTERS[FilterRegistry<br/>schema-driven]
    end

    subgraph Ingest["Ingestion Subsystem"]
        REG[Connector Registry]
        IFACE[SourceConnector interface]
        APIC[ApiConnector base]
        SCRAPEC[ScraperConnector base]
        NORM[Normalizer]
        VALID[Validator / Quality Gate]
        DEDUP[Deduplication Engine]
    end

    PROFILES --> FILTERS
    MATCHAPI --> FILTERS
    SOURCES --> REG
    REG --> IFACE
    IFACE --> APIC
    IFACE --> SCRAPEC
    APIC --> NORM
    SCRAPEC --> NORM
    NORM --> VALID
    VALID --> DEDUP
```

## 5.4 Поток данных (Data Flow, end-to-end)

```mermaid
flowchart LR
    A[Scheduler tick] --> B{Источник активен?}
    B -- да --> C[Enqueue fetch job<br/>source=X, page=N]
    C --> D[Ingestion Worker]
    D --> E[Connector.fetch<br/>API или Scrape]
    E --> F[Raw items]
    F --> G[Normalizer → Listing model]
    G --> H[Validator / Quality Gate]
    H -- invalid --> H2[Drop + log + metric]
    H -- valid --> I[Dedup Engine]
    I -- duplicate --> J[Update existing + history]
    I -- new --> K[Insert Listing]
    K --> L[Emit listing.created]
    J -- significant change --> L2[Emit listing.changed]
    L --> M[Matching Worker]
    L2 --> M
    M --> N[Кандидаты профилей<br/>грубый префильтр]
    N --> O[Точный матч по фильтрам]
    O -- match & not notified --> P[Create Match + enqueue notify]
    P --> Q[Notification Worker]
    Q --> R[Render шаблон]
    R --> S[Telegram sendMessage]
    S --> T[Записать delivery + dedupe key]
```

## 5.5 Sequence — поиск/сбор и матчинг

```mermaid
sequenceDiagram
    participant SCH as Scheduler
    participant Q as Redis Queue
    participant W as Ingestion Worker
    participant C as Connector(Source)
    participant DB as PostgreSQL
    participant MQ as Match Queue
    participant MW as Matching Worker

    SCH->>Q: enqueue fetch(source, cursor)
    Q->>W: deliver job
    W->>C: fetch(cursor)
    C-->>W: raw listings[]
    W->>W: normalize + validate
    W->>DB: dedup lookup (hash/fingerprint)
    alt новое объявление
        W->>DB: INSERT listing
        W->>MQ: emit listing.created(id)
    else изменилось
        W->>DB: UPDATE + INSERT history
        W->>MQ: emit listing.changed(id)
    else дубликат без изменений
        W->>DB: touch last_seen_at
    end
    MQ->>MW: deliver listing event
    MW->>DB: SELECT candidate profiles (coarse)
    MW->>MW: precise filter match
    MW->>DB: INSERT match (if new)
    MW->>Q: enqueue notify(match_id)
```

## 5.6 Sequence — обработка уведомления

```mermaid
sequenceDiagram
    participant Q as Notify Queue
    participant NW as Notification Worker
    participant DB as PostgreSQL
    participant T as Telegram API
    participant U as Пользователь

    Q->>NW: notify(match_id)
    NW->>DB: load match + listing + profile + tg_subscription
    NW->>DB: check dedupe (sent before?)
    alt уже отправлено
        NW-->>Q: ack (skip)
    else не отправлено и уведомления включены
        NW->>NW: render template (locale)
        NW->>T: sendPhoto/sendMessage(chat_id, payload)
        alt 429 rate limit
            T-->>NW: retry_after
            NW->>Q: requeue with delay
        else success
            T-->>U: 🏠 Новая квартира...
            NW->>DB: INSERT notification_log (delivered)
        end
    end
```

## 5.7 Окружения (Environments)

| Окружение | Назначение | Данные | Источники |
|-----------|-----------|--------|-----------|
| **Development** | Локальная разработка | Сиды + mock source | Mock connector |
| **Staging** | Предпрод, интеграционные тесты | Анонимизированные | Реальные источники в «сухом» режиме (без отправки в Telegram, либо тестовый бот) |
| **Production** | Боевая | Реальные | Все включённые |

## 5.8 Ключевые архитектурные принципы

1. **Async-first**: всё, что обращается к внешнему миру (источники, Telegram), идёт через очереди → устойчивость к сбоям и всплескам.
2. **Plugin isolation**: каждый источник — изолированный плагин с собственным контрактом, конфигом и лимитами.
3. **Schema-driven filters**: фильтры декларативны, добавление нового не требует правки матчинга (см. раздел 10).
4. **Idempotency everywhere**: ключи дедупликации на уровне объявлений и уведомлений.
5. **Observability by default**: метрики/логи/трейсы встроены в каждый компонент.
6. **Stateless app tier**: всё состояние — в PostgreSQL/Redis/S3.
