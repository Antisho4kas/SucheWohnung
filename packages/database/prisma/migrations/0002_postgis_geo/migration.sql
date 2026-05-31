-- PostGIS geo column + advanced indexes that Prisma cannot model natively
-- (§07.3 DDL / §07.4 Indexes). Applied after the Prisma-generated baseline.

-- Geography point column for radius search
-- (§03.2.1 location filter, §10.3 ST_DWithin).
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "geo" geography(Point, 4326);

-- GIST index for geo radius queries (§07.4 idx_listings_geo).
CREATE INDEX IF NOT EXISTS "idx_listings_geo" ON "listings" USING GIST ("geo");

-- GIN index over JSONB attributes for boolean-attribute matching
-- (§07.4 idx_listings_attrs).
CREATE INDEX IF NOT EXISTS "idx_listings_attrs" ON "listings" USING GIN ("attributes");

-- Trigram index on title for fuzzy full-text (§07.4 idx_listings_title_trgm).
CREATE INDEX IF NOT EXISTS "idx_listings_title_trgm"
  ON "listings" USING GIN ("title" gin_trgm_ops);

-- Partial index: only active profiles participate in matching
-- (§07.4 idx_profiles_active).
CREATE INDEX IF NOT EXISTS "idx_profiles_active"
  ON "search_profiles" ("is_active") WHERE "is_active";

-- GIN index over the denormalized criteria snapshot for the coarse prefilter
-- (§07.4 idx_profiles_criteria, §10.3).
CREATE INDEX IF NOT EXISTS "idx_profiles_criteria"
  ON "search_profiles" USING GIN ("criteria");
