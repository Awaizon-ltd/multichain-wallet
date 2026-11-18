-- migrations/004_solana_swap_tracking.rollback.sql
-- Restores the original 0x-only column widths. Solana rows must be removed
-- first or the narrowing ALTER fails on values that no longer fit.

DELETE FROM swap_transactions WHERE chain_id = 501000101;

DROP VIEW IF EXISTS swap_leaderboard;

ALTER TABLE swap_transactions
  ALTER COLUMN wallet_address     TYPE VARCHAR(42),
  ALTER COLUMN sell_token_address TYPE VARCHAR(42),
  ALTER COLUMN buy_token_address  TYPE VARCHAR(42),
  ALTER COLUMN tx_hash            TYPE VARCHAR(66);

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
