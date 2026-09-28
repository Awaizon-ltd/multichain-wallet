-- migrations/003_banners.sql
-- Promo banners (moved from MongoDB). Image bytes are stored inline — max 5 rows.

CREATE TABLE IF NOT EXISTS banners (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title              VARCHAR(100) NOT NULL,
  subtitle           VARCHAR(150) NOT NULL DEFAULT '',
  description        VARCHAR(2000) NOT NULL DEFAULT '',
  image_data         BYTEA        NOT NULL,
  image_content_type TEXT         NOT NULL,
  cta_label          TEXT         NOT NULL DEFAULT 'Learn More',
  cta_url            TEXT         NOT NULL DEFAULT '',
  "order"            SMALLINT     NOT NULL UNIQUE CHECK ("order" BETWEEN 1 AND 5),
  active             BOOLEAN      NOT NULL DEFAULT TRUE,
  badge              TEXT         NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
