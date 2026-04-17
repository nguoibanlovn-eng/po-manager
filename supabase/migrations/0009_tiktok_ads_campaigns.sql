-- TikTok Ads campaign-level data (BM vs GMV Max)
create table if not exists tiktok_ads_campaigns (
  id              uuid default gen_random_uuid() primary key,
  date            date not null,
  advertiser_id   text not null,
  campaign_id     text not null,
  campaign_name   text,
  promotion_type  text, -- 'REGULAR' (BM) | 'GMV_MAX' | etc
  spend           numeric default 0,
  impressions     numeric default 0,
  clicks          numeric default 0,
  conversions     numeric default 0,
  conversion_value numeric default 0,
  synced_at       timestamptz default now(),
  unique (date, campaign_id)
);
