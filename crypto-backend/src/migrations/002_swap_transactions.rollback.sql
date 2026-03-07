-- migrations/002_swap_transactions.rollback.sql
-- Rolls back the swap tracking schema

DROP VIEW  IF EXISTS swap_leaderboard;
DROP TABLE IF EXISTS swap_transactions;