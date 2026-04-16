-- TikTok Shop: store per-shop OAuth tokens. Access tokens auto-refreshed on use.

create table if not exists tktshop_shops (
  shop_id       text primary key,
  name          text,
  access_token  text,
  refresh_token text,
  expires_at    bigint,        -- Unix seconds when access_token expires
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table tktshop_shops enable row level security;

-- Seed data: see DEPLOY.md (not committed here to avoid leaking tokens).
