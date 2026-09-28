-- ============================================================
-- Migration 001: Staking Pools
-- Run with: psql $DATABASE_URL -f migrations/001_create_staking_pools.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS staking_pools (
  id                  SERIAL PRIMARY KEY,

  -- Identity
  pool_address        VARCHAR(42)   NOT NULL UNIQUE,
  staking_token       VARCHAR(42)   NOT NULL,
  reward_token        VARCHAR(42)   NOT NULL,
  pool_owner          VARCHAR(42)   NOT NULL,

  -- Timing (unix seconds)
  start_time          BIGINT        NOT NULL,
  end_time            BIGINT        NOT NULL,
  lock_period         BIGINT        NOT NULL,   -- seconds

  -- Status
  is_active           BOOLEAN       NOT NULL DEFAULT false,
  is_funded           BOOLEAN       NOT NULL DEFAULT false,
  paused              BOOLEAN       NOT NULL DEFAULT false,

  -- TVL & Rewards (stored as TEXT to preserve uint256 precision)
  total_staked        NUMERIC(78,0) NOT NULL DEFAULT 0,
  reward_pool         NUMERIC(78,0) NOT NULL DEFAULT 0,
  reward_rate         NUMERIC(78,0) NOT NULL DEFAULT 0,
  apr_bps             BIGINT        NOT NULL DEFAULT 0,  -- 10000 = 100%
  projected_apr_bps   BIGINT        NOT NULL DEFAULT 0,  -- APR if solo staker

  -- Fees (bps)
  stake_fee           INT           NOT NULL DEFAULT 0,
  withdraw_fee        INT           NOT NULL DEFAULT 0,
  emergency_penalty   INT           NOT NULL DEFAULT 0,

  -- Sync metadata
  chain_id            INT           NOT NULL DEFAULT 1,
  last_synced_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_staking_pools_owner        ON staking_pools(pool_owner);
CREATE INDEX IF NOT EXISTS idx_staking_pools_is_active    ON staking_pools(is_active);
CREATE INDEX IF NOT EXISTS idx_staking_pools_chain        ON staking_pools(chain_id);
CREATE INDEX IF NOT EXISTS idx_staking_pools_end_time     ON staking_pools(end_time);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staking_pools_updated_at ON staking_pools;
CREATE TRIGGER trg_staking_pools_updated_at
  BEFORE UPDATE ON staking_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;