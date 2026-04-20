-- Facebook tokens stored in DB for auto-refresh
create table if not exists fb_tokens (
  token_type    text primary key,            -- 'user' (single user token for both ads + pages)
  access_token  text not null default '',
  expire_at     bigint not null default 0,    -- unix timestamp
  updated_at    text default ''
);
