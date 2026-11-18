-- migrations/005_identities.sql
-- Wallet identities: one username per wallet account, bound to that
-- account's EVM AND Solana address, created only after the server has
-- verified a signature from each key over a one-time challenge.
--
-- Deliberately no signature / message / nonce columns: signatures are
-- verified in memory and discarded — they're never persisted.
--
-- Replaces the old `users` binding (username + email → EVM address, with no
-- proof of ownership). That table is left in place, untouched, but nothing
-- resolves usernames through it anymore.

CREATE TABLE IF NOT EXISTS identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        VARCHAR(20)  NOT NULL,
  evm_address     VARCHAR(42)  NOT NULL,   -- stored lowercase
  solana_address  VARCHAR(44)  NOT NULL,   -- base58, case-sensitive
  verified_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_identities_username UNIQUE (username),
  CONSTRAINT uq_identities_evm      UNIQUE (evm_address),
  CONSTRAINT uq_identities_solana   UNIQUE (solana_address),

  CONSTRAINT chk_identities_username CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT chk_identities_evm      CHECK (evm_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT chk_identities_solana   CHECK (solana_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
);
