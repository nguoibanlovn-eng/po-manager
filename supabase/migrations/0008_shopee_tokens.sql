-- Shopee shop tokens for API access
create table if not exists shopee_tokens (
  shop_id       text primary key,
  shop_name     text,
  access_token  text not null default '',
  refresh_token text not null default '',
  expire_at     bigint not null default 0
);
