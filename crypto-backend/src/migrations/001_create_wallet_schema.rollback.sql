-- ============================================================
-- Migration: 001_create_wallet_schema.rollback.sql
-- Description: Rollback — drop all wallet schema objects
-- Direction: DOWN
-- ============================================================

BEGIN;

DROP TRIGGER  IF EXISTS trg_users_updated_at    ON users;
DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS transaction_logs  CASCADE;
DROP TABLE IF EXISTS wallet_chains     CASCADE;
DROP TABLE IF EXISTS users             CASCADE;

DROP TYPE IF EXISTS blockchain_chain;

COMMIT;