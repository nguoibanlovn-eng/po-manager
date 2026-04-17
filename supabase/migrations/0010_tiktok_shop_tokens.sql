CREATE TABLE IF NOT EXISTS tiktok_shop_tokens (
  shop_cipher text PRIMARY KEY,
  shop_name text,
  access_token text NOT NULL DEFAULT '',
  refresh_token text NOT NULL DEFAULT '',
  expire_at bigint NOT NULL DEFAULT 0
);
