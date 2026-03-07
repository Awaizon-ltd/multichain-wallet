-- ============================================================
-- Migration: 001_create_wallet_schema.sql
-- Description: Create users and transaction_logs tables
-- Direction: UP
-- ============================================================

BEGIN;

-- --------------------------------------------------------
-- ENUM: supported blockchain chains
-- --------------------------------------------------------
CREATE TYPE blockchain_chain AS ENUM (
  'EVM',
  'ETH',
  'POL',
  'BNB',
  'AVAX',
  'ARB',
  'OP',
  'Base',
  'MNT',
  'ZETA',
  'HYPE'
);

-- --------------------------------------------------------
-- TABLE: users
-- One-to-one mapping: email <-> wallet_address
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(64)   NOT NULL,
  email            VARCHAR(320)  NOT NULL,
  wallet_address   VARCHAR(256)  NOT NULL,
  chain            blockchain_chain NOT NULL DEFAULT 'EVM',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- One-to-one: each email maps to exactly one wallet
  CONSTRAINT uq_users_email          UNIQUE (email),
  -- One-to-one: each wallet maps to exactly one email
  CONSTRAINT uq_users_wallet_address UNIQUE (wallet_address),
  -- Username must also be globally unique
  CONSTRAINT uq_users_username       UNIQUE (username),

  -- Basic format guards (belt-and-suspenders; app layer validates too)
  CONSTRAINT chk_users_email_format
    CHECK (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
  CONSTRAINT chk_users_username_length
    CHECK (char_length(username) >= 3),
  CONSTRAINT chk_users_wallet_nonempty
    CHECK (char_length(wallet_address) >= 26)
);

-- --------------------------------------------------------
-- INDEXES for fast lookup
-- --------------------------------------------------------
-- Lookup by username (login / resolve)
CREATE INDEX IF NOT EXISTS idx_users_username
  ON users (username);

-- Lookup by email (login / resolve)
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

-- Lookup by wallet address (reverse resolve)
CREATE INDEX IF NOT EXISTS idx_users_wallet_address
  ON users (wallet_address);

-- Lookup by chain (e.g. "all ETH wallets")
CREATE INDEX IF NOT EXISTS idx_users_chain
  ON users (chain);

-- --------------------------------------------------------
-- TABLE: wallet_chains (future multi-chain support)
-- When a user needs wallets on multiple chains, expand here
-- without touching the users table.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_chains (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(256)    NOT NULL,
  chain          blockchain_chain NOT NULL,
  is_primary     BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_wallet_chains_address UNIQUE (wallet_address),
  CONSTRAINT uq_wallet_chains_user_chain UNIQUE (user_id, chain)
);

CREATE INDEX IF NOT EXISTS idx_wallet_chains_user_id
  ON wallet_chains (user_id);

-- --------------------------------------------------------
-- TABLE: transaction_logs (audit trail / future transfers)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id     UUID          REFERENCES users(id) ON DELETE SET NULL,
  to_user_id       UUID          REFERENCES users(id) ON DELETE SET NULL,
  from_address     VARCHAR(256)  NOT NULL,
  to_address       VARCHAR(256)  NOT NULL,
  chain            blockchain_chain NOT NULL DEFAULT 'EVM',
  tx_hash          VARCHAR(128),
  amount_raw       NUMERIC(36, 0),           -- smallest unit (wei, lamports…)
  amount_decimals  SMALLINT DEFAULT 18,
  token_symbol     VARCHAR(16),
  status           VARCHAR(32)   NOT NULL DEFAULT 'pending',
  error_message    TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  confirmed_at     TIMESTAMPTZ,

  CONSTRAINT chk_tx_status CHECK (
    status IN ('pending', 'confirmed', 'failed', 'dropped')
  )
);

CREATE INDEX IF NOT EXISTS idx_tx_logs_from_user  ON transaction_logs (from_user_id);
CREATE INDEX IF NOT EXISTS idx_tx_logs_to_user    ON transaction_logs (to_user_id);
CREATE INDEX IF NOT EXISTS idx_tx_logs_tx_hash    ON transaction_logs (tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_logs_chain      ON transaction_logs (chain);
CREATE INDEX IF NOT EXISTS idx_tx_logs_created_at ON transaction_logs (created_at DESC);

-- --------------------------------------------------------
-- TRIGGER: auto-update updated_at on users
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;