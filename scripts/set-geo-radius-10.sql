-- ============================================================================
-- Ops script: set the geo search radius to 10 km on all geo ("within") rules.
-- Targets the operator's regions (Ingolstadt, Reichertshofen, Pfaffenhofen an
-- der Ilm). Updates BOTH the authoritative EAV value (profile_filters.value)
-- and the denormalized snapshot used by the coarse prefilter
-- (search_profiles.criteria.location.radius_km).
--
-- SAFETY:
--   1. This changes PRODUCTION data. Take a backup first, e.g.:
--        pg_dump -U app -d suchewohnung -t profile_filters -t search_profiles \
--          > backup_geo_$(date +%F).sql
--      (or, in Docker compose:
--        docker compose -f docker-compose.prod.yml exec postgres \
--          pg_dump -U app -d suchewohnung -t profile_filters -t search_profiles \
--          > backup_geo.sql )
--   2. Run the PREVIEW block first and confirm the rows/old radius values.
--   3. Then run the TRANSACTION block. It is wrapped in BEGIN/COMMIT.
--
-- Geo filters are identified by filter_definitions.data_type = 'geo' (robust to
-- the filter key name) combined with the 'within' operator.
-- ============================================================================

-- -------- PREVIEW (read-only): inspect what will change --------------------
SELECT
  pf.id                              AS profile_filter_id,
  sp.id                              AS profile_id,
  sp.name                            AS profile_name,
  pf.value ->> 'lat'                 AS lat,
  pf.value ->> 'lng'                 AS lng,
  pf.value ->> 'radius_km'           AS current_radius_km
FROM profile_filters pf
JOIN filter_definitions fd ON fd.id = pf.filter_def_id
JOIN search_profiles    sp ON sp.id = pf.profile_id
WHERE fd.data_type = 'geo'
  AND pf.operator = 'within'
ORDER BY sp.name;

-- -------- APPLY (transaction): set radius_km = 10 ---------------------------
BEGIN;

-- 1) Authoritative EAV value driving the precise predicate engine.
UPDATE profile_filters pf
SET value = jsonb_set(pf.value, '{radius_km}', '10'::jsonb, true)
FROM filter_definitions fd
WHERE pf.filter_def_id = fd.id
  AND fd.data_type = 'geo'
  AND pf.operator = 'within';

-- 2) Denormalized criteria snapshot used by the coarse SQL prefilter.
UPDATE search_profiles sp
SET criteria = jsonb_set(sp.criteria, '{location,radius_km}', '10'::jsonb, true),
    updated_at = now()
WHERE sp.criteria ? 'location';

COMMIT;

-- -------- VERIFY (read-only): confirm new radius values ---------------------
SELECT
  sp.name                            AS profile_name,
  pf.value ->> 'lat'                 AS lat,
  pf.value ->> 'lng'                 AS lng,
  pf.value ->> 'radius_km'           AS radius_km_after,
  sp.criteria -> 'location' ->> 'radius_km' AS criteria_radius_after
FROM profile_filters pf
JOIN filter_definitions fd ON fd.id = pf.filter_def_id
JOIN search_profiles    sp ON sp.id = pf.profile_id
WHERE fd.data_type = 'geo'
  AND pf.operator = 'within'
ORDER BY sp.name;
