-- ============================================================
-- Migration 002: Add projected_apr_bps column to staking_pools
-- Run with: psql $DATABASE_URL -f migrations/002_add_projected_apr_bps.sql
-- Or via: node src/scripts/migrate.js
-- ============================================================

BEGIN;

ALTER TABLE staking_pools
  ADD COLUMN IF NOT EXISTS projected_apr_bps BIGINT NOT NULL DEFAULT 0;

COMMIT;