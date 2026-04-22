-- GMV Max daily data (aggregated from TikTok Business API /gmv_max/report/get/)
create table if not exists tiktok_gmv_max (
  date date not null,
  store_id text not null,
  advertiser_id text default '7320546391249747970',
  store_name text,
  store_code text,
  spend numeric default 0,
  gross_revenue numeric default 0,
  roi numeric default 0,
  orders integer default 0,
  cost_per_order numeric default 0,
  synced_at text,
  primary key (date, store_id)
);

-- GMV Max product breakdown
create table if not exists tiktok_gmv_max_products (
  date date not null,
  store_id text not null,
  item_group_id text not null,
  campaign_id text,
  spend numeric default 0,
  gross_revenue numeric default 0,
  roi numeric default 0,
  orders integer default 0,
  cost_per_order numeric default 0,
  synced_at text,
  primary key (date, store_id, item_group_id)
);

create index if not exists idx_gmv_max_date on tiktok_gmv_max (date);
create index if not exists idx_gmv_max_products_date on tiktok_gmv_max_products (date);
