-- migrations/004_solana_swap_tracking.sql
-- Widens swap_transactions so Solana swaps fit: base58 wallet addresses and
-- mints are up to 44 chars (VARCHAR(42) only fit 0x addresses) and a Solana
-- signature is up to 88 chars (VARCHAR(66) only fit 0x tx hashes).
-- Solana's chain_id is stored as 501000101, which fits the INTEGER column.
--
-- swap_leaderboard reads wallet_address, and Postgres refuses to change the
-- type of a column a view depends on, so the view is dropped and recreated.

DROP VIEW IF EXISTS swap_leaderboard;

ALTER TABLE swap_transactions
  ALTER COLUMN wallet_address     TYPE VARCHAR(64),
  ALTER COLUMN sell_token_address TYPE VARCHAR(64),
  ALTER COLUMN buy_token_address  TYPE VARCHAR(64),
  ALTER COLUMN tx_hash            TYPE VARCHAR(128);

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
