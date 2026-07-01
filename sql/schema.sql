-- SucheWohnung — PostgreSQL 16 + PostGIS schema
-- Извлечено из 07-Database-Design.md (§7.3 DDL + §7.4 индексы)

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS ----------------------------------------------------------
CREATE TYPE user_role   AS ENUM ('user','premium','admin','super_admin');
CREATE TYPE user_status AS ENUM ('pending','active','suspended','deleted');

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          CITEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    role           user_role   NOT NULL DEFAULT 'user',
    status         user_status NOT NULL DEFAULT 'pending',
    locale         TEXT NOT NULL DEFAULT 'de',
    email_verified_at TIMESTAMPTZ,
    last_login_at  TIMESTAMPTZ,
    deleted_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users (email) WHERE deleted_at IS NULL;

-- SOURCES --------------------------------------------------------
CREATE TYPE integration_type AS ENUM ('api','scrape');

CREATE TABLE sources (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    integration_type integration_type NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT false,
    schedule_cron    TEXT NOT NULL DEFAULT '*/15 * * * *',
    rate_limit_rpm   INT NOT NULL DEFAULT 30,
    breaker_state    TEXT NOT NULL DEFAULT 'closed', -- closed|open|half_open
    config           JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_credentials (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id        UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    type             TEXT NOT NULL, -- api_key|oauth|cookie|basic
    encrypted_secret JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LISTINGS -------------------------------------------------------
CREATE TYPE listing_status AS ENUM ('active','updated','expired','removed');

CREATE TABLE listings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     UUID NOT NULL REFERENCES sources(id),
    external_id   TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    url           TEXT NOT NULL,
    title         TEXT,
    price         NUMERIC(10,2),
    warm_rent     NUMERIC(10,2),
    area          NUMERIC(7,2),
    rooms         NUMERIC(4,1),
    city          TEXT,
    bundesland    TEXT,
    postal_code   TEXT,
    geo           GEOGRAPHY(Point, 4326),
    attributes    JSONB NOT NULL DEFAULT '{}', -- balcony, elevator, provisionfrei...
    status        listing_status NOT NULL DEFAULT 'active',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw           JSONB,
    CONSTRAINT uq_source_external UNIQUE (source_id, external_id),
    CONSTRAINT uq_fingerprint     UNIQUE (fingerprint)
);

CREATE TABLE listing_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    field       TEXT NOT NULL,
    old_value   JSONB,
    new_value   JSONB,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE listing_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    storage_key TEXT,
    position    INT NOT NULL DEFAULT 0
);

-- FILTERS (schema-driven) ---------------------------------------
CREATE TABLE filter_definitions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key          TEXT NOT NULL UNIQUE,        -- price, rooms, balcony...
    label        JSONB NOT NULL,              -- {de:..., en:..., ru:...}
    data_type    TEXT NOT NULL,               -- number|bool|enum|range|geo
    operator_set TEXT[] NOT NULL,             -- {gte,lte,eq,in,within}
    config       JSONB NOT NULL DEFAULT '{}', -- unit, enum values, ui
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SEARCH PROFILES -----------------------------------------------
CREATE TABLE search_profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    notify      BOOLEAN NOT NULL DEFAULT true,
    auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_reply_text    TEXT,
    criteria    JSONB NOT NULL DEFAULT '{}',  -- денормализованный снимок
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profile_filters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id    UUID NOT NULL REFERENCES search_profiles(id) ON DELETE CASCADE,
    filter_def_id UUID NOT NULL REFERENCES filter_definitions(id),
    operator      TEXT NOT NULL,
    value         JSONB NOT NULL
);

-- MATCHES & NOTIFICATIONS ---------------------------------------
CREATE TABLE matches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID NOT NULL REFERENCES search_profiles(id) ON DELETE CASCADE,
    listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    state       TEXT NOT NULL DEFAULT 'pending', -- pending|notified|dismissed
    matched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_profile_listing UNIQUE (profile_id, listing_id)
);

CREATE TABLE telegram_subscriptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id    BIGINT NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT true,
    linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_chat UNIQUE (user_id, chat_id)
);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES telegram_subscriptions(id),
    channel         TEXT NOT NULL DEFAULT 'telegram',
    status          TEXT NOT NULL DEFAULT 'queued',
    dedupe_key      TEXT NOT NULL UNIQUE,
    error           TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-reply seam (Part 1): recorded intended seller reply per match. Platform
-- send is Part 2 (blocked on a connector capability); rows carry status
-- 'skipped_no_channel' until a send channel exists.
CREATE TABLE seller_replies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL DEFAULT 'kleinanzeigen',
    status          TEXT NOT NULL DEFAULT 'pending',
    body            TEXT NOT NULL,
    dedupe_key      TEXT NOT NULL UNIQUE,
    error           TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OPERATIONS -----------------------------------------------------
CREATE TABLE source_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    status        TEXT NOT NULL, -- running|success|partial|failed
    items_fetched INT DEFAULT 0,
    items_new     INT DEFAULT 0,
    items_updated INT DEFAULT 0,
    errors        INT DEFAULT 0,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);

CREATE TABLE user_consents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL, -- tos, privacy, marketing
    granted      BOOLEAN NOT NULL,
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash      TEXT
);

CREATE TABLE audit_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id   UUID REFERENCES users(id),
    action     TEXT NOT NULL,
    meta       JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_queue_audit (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue      TEXT NOT NULL,
    job_id     TEXT NOT NULL,
    source_id  UUID REFERENCES sources(id),
    status     TEXT NOT NULL,
    attempts   INT DEFAULT 0,
    payload    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ИНДЕКСЫ ============
-- Гео‑поиск по радиусу
CREATE INDEX idx_listings_geo       ON listings USING GIST (geo);
-- Частые фильтры матчинга
CREATE INDEX idx_listings_city      ON listings (city);
CREATE INDEX idx_listings_postal    ON listings (postal_code);
CREATE INDEX idx_listings_price     ON listings (price);
CREATE INDEX idx_listings_rooms     ON listings (rooms);
CREATE INDEX idx_listings_status_seen ON listings (status, last_seen_at);
-- JSONB атрибуты (булевы признаки)
CREATE INDEX idx_listings_attrs     ON listings USING GIN (attributes);
-- Полнотекст по заголовку/городу
CREATE INDEX idx_listings_title_trgm ON listings USING GIN (title gin_trgm_ops);
-- Матчинг: быстрый поиск активных профилей
CREATE INDEX idx_profiles_active    ON search_profiles (is_active) WHERE is_active;
CREATE INDEX idx_profiles_criteria  ON search_profiles USING GIN (criteria);
-- Дедупликация уведомлений
CREATE INDEX idx_notif_status       ON notifications (status, created_at);
CREATE INDEX idx_seller_replies_status ON seller_replies (status, created_at);
-- Операционные
CREATE INDEX idx_source_runs_src    ON source_runs (source_id, started_at DESC);
CREATE INDEX idx_history_listing    ON listing_history (listing_id, changed_at DESC);
CREATE INDEX idx_matches_profile    ON matches (profile_id, matched_at DESC);
