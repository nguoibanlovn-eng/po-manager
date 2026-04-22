-- Lưu TikTok Ads access_token từ OAuth callback (thay vì .env.local)
create table if not exists tiktok_ads_token (
  app_id text primary key,
  access_token text not null,
  advertiser_ids text[] default '{}',
  updated_at timestamptz default now()
);
