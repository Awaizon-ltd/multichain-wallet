-- migrations/002_swap_transactions.sql

CREATE TABLE IF NOT EXISTS swap_transactions (
  id                  BIGSERIAL PRIMARY KEY,

  -- Identity (nullable — user may not be bound yet)
  -- user_id is a soft reference to users.id — no FK constraint so this
  -- migration runs independently of the wallet schema migration.
  wallet_address      VARCHAR(42)     NOT NULL,
  user_id             BIGINT,

  -- Chain & tokens
  chain_id            INTEGER         NOT NULL,
  sell_token_symbol   VARCHAR(20)     NOT NULL,
  sell_token_address  VARCHAR(42)     NOT NULL,
  buy_token_symbol    VARCHAR(20)     NOT NULL,
  buy_token_address   VARCHAR(42)     NOT NULL,

  -- Amounts (stored as TEXT to preserve full precision)
  sell_amount_raw     TEXT            NOT NULL,
  buy_amount_raw      TEXT            NOT NULL,
  sell_amount_usd     NUMERIC(20, 6),
  buy_amount_usd      NUMERIC(20, 6),

  -- On-chain proof
  tx_hash             VARCHAR(66)     NOT NULL UNIQUE,
  block_number        BIGINT,
  gas_used            TEXT,

  -- 0x metadata
  slippage            NUMERIC(6, 4),
  price_impact        NUMERIC(6, 4),
  fee_amount_raw      TEXT,

  -- Timestamps
  confirmed_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_wallet        ON swap_transactions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_swap_user_id       ON swap_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_swap_chain         ON swap_transactions (chain_id);
CREATE INDEX IF NOT EXISTS idx_swap_confirmed_at  ON swap_transactions (confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_tx_hash       ON swap_transactions (tx_hash);

CREATE OR REPLACE VIEW swap_leaderboard AS
SELECT
  s.wallet_address,
  s.user_id,
  COUNT(*)                               AS total_swaps,
  SUM(s.sell_amount_usd)                 AS total_volume_usd,
  COUNT(DISTINCT s.chain_id)             AS chains_used,
  MAX(s.confirmed_at)                    AS last_swap_at
FROM swap_transactions s
GROUP BY s.wallet_address, s.user_id
ORDER BY total_volume_usd DESC NULLS LAST;