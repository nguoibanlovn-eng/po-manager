-- ─────────────────────────────────────────────────────────────
-- PO Manager v7 — initial schema (Phase 0)
-- Ported from gs.txt HDR constants. Column names match the
-- original Google Sheets headers 1:1 unless noted (e.g. `config.grp`
-- renamed from reserved keyword `group`).
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ─── 00_Config ────────────────────────────────────────────────
create table config (
  grp         text not null,        -- originally "group" (reserved)
  key         text not null,
  label       text,
  value       text,
  sort        integer default 0,
  is_active   boolean default true,
  primary key (grp, key)
);

-- ─── 01_Orders ────────────────────────────────────────────────
create table orders (
  order_id            text primary key,
  created_at          timestamptz default now(),
  created_by          text,
  updated_at          timestamptz default now(),
  owner               text,
  order_name          text,
  supplier_name       text,
  supplier_contact    text,
  pay_status          text,            -- UNPAID | DEPOSIT | PAID | DEBT
  deposit_amount      numeric default 0,
  payment_date        date,
  finance_note        text,
  order_date          date,
  eta_date            date,
  arrival_date        date,
  item_count          integer default 0,
  total_qty           integer default 0,
  order_total         numeric default 0,
  return_cost_total   numeric default 0,
  damage_cost_total   numeric default 0,
  total_loss          numeric default 0,
  stage               text default 'DRAFT',   -- DRAFT|ORDERED|ARRIVED|QC_DONE|ON_SHELF|SELLING|COMPLETED
  order_status        text,
  note                text,
  goods_type          text,
  is_deleted          boolean default false,
  deleted_at          timestamptz,
  deleted_by          text,
  -- approval flow (gs.txt PHẦN 2)
  is_locked           boolean default false,
  unlock_requested_by text,
  unlock_reason       text,
  unlock_approved_by  text,
  unlock_approved_at  timestamptz
);
create index idx_orders_stage       on orders(stage) where not is_deleted;
create index idx_orders_owner       on orders(owner) where not is_deleted;
create index idx_orders_created_at  on orders(created_at desc);

-- ─── 02_Items ─────────────────────────────────────────────────
create table items (
  order_id              text not null references orders(order_id) on delete cascade,
  line_id               text not null,
  stt                   integer,
  sku                   text,
  product_name          text,
  link                  text,
  item_type             text,
  qty                   numeric default 0,
  unit_price            numeric default 0,
  line_total            numeric default 0,
  qc_status             text,
  damage_qty            numeric default 0,
  damage_amount         numeric default 0,
  damage_handled        boolean default false,
  damage_note           text,
  shelf_done            boolean default false,
  return_status         text,
  return_cost           numeric default 0,
  note                  text,
  is_deleted            boolean default false,
  resolution_type       text,
  resolution_status     text,
  resolution_evidence   text,
  resolved_amount       numeric default 0,
  resolved_date         date,
  replacement_bill_id   text,
  replacement_qty       numeric default 0,
  liquidation_sku       text,
  liquidation_bill_id   text,
  finance_confirmed     boolean default false,
  ticket_sent_at        timestamptz,
  kt_note               text,
  bank_name             text,
  bank_account          text,
  bank_account_name     text,
  refund_method         text,
  primary key (order_id, line_id)
);
create index idx_items_sku on items(sku);

-- ─── 03_Budget ────────────────────────────────────────────────
create table budgets (
  month_key       text not null,     -- YYYY-MM
  team            text not null,
  budget_amount   numeric default 0,
  note            text,
  primary key (month_key, team)
);

-- ─── 04_Suppliers ─────────────────────────────────────────────
create table suppliers (
  supplier_name     text primary key,
  supplier_contact  text,
  use_count         integer default 0,
  last_used         timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  is_deleted        boolean default false
);

-- ─── 05_Users ─────────────────────────────────────────────────
create table users (
  email               text primary key,
  name                text,
  role                text not null,    -- ADMIN | LEADER_MH | NV_MH | LEADER_KT | NV_KT | LEADER_KD | NV_KD | LEADER_KETOAN | NV_KETOAN | VIEWER
  team                text,
  channels            text,             -- CSV: facebook,shopee,tiktok,web
  is_active           boolean default true,
  extra_permissions   text,             -- CSV of permission keys
  locked_at           timestamptz,
  locked_by           text,
  created_at          timestamptz default now(),
  note                text
);

-- ─── 07_Targets ───────────────────────────────────────────────
create table targets (
  target_id     text primary key,
  type          text,           -- REVENUE | QTY | ...
  ref_id        text,           -- page_id / sku / ...
  assigned_to   text,           -- email
  month_key     text,
  rev_target    numeric default 0,
  qty_target    numeric default 0,
  deadline      date,
  note          text,
  created_by    text,
  created_at    timestamptz default now()
);
create index idx_targets_month_assignee on targets(month_key, assigned_to);

-- ─── 08_Pages ─────────────────────────────────────────────────
create table pages (
  page_id         text primary key,
  page_name       text,
  platform        text,           -- facebook | shopee | tiktok | web
  assigned_email  text,
  assigned_name   text,
  is_active       boolean default true,
  last_sync       timestamptz,
  nhanh_id        text,
  ad_account_id   text
);

-- ─── 09_Assignments ───────────────────────────────────────────
create table assignments (
  assign_id       text primary key,
  order_id        text references orders(order_id) on delete cascade,
  sku             text,
  assigned_email  text,
  assigned_name   text,
  channel         text,
  page_id         text,
  status          text default 'PENDING',   -- PENDING | DONE
  done_at         timestamptz,
  note            text,
  created_at      timestamptz default now()
);
create index idx_assignments_order    on assignments(order_id);
create index idx_assignments_assignee on assignments(assigned_email);

-- ─── 10_Sales_Sync ────────────────────────────────────────────
create table sales_sync (
  id                text primary key default gen_random_uuid()::text,
  channel           text,
  source            text,
  period_from       date,
  period_to         date,
  order_total       integer default 0,
  order_cancel      integer default 0,
  order_net         integer default 0,
  revenue_total     numeric default 0,
  revenue_cancel    numeric default 0,
  revenue_net       numeric default 0,
  order_success     integer default 0,
  revenue_success   numeric default 0,
  synced_at         timestamptz default now(),
  unique (channel, source, period_from, period_to)
);
create index idx_sales_sync_period on sales_sync(period_from, period_to);

-- ─── 11_Inventory ─────────────────────────────────────────────
create table inventory (
  sku               text primary key,
  product_name      text,
  category          text,
  available_qty     numeric default 0,
  in_transit_qty    numeric default 0,
  total_qty         numeric default 0,
  reserved_qty      numeric default 0,
  sold_30d          numeric default 0,
  last_sync         timestamptz
);

-- ─── 12_Products ──────────────────────────────────────────────
create table products (
  sku           text primary key,
  product_name  text,
  category      text,
  unit          text,
  image_url     text,
  cost_price    numeric default 0,
  sell_price    numeric default 0,
  stock         numeric default 0,
  is_active     boolean default true,
  last_sync     timestamptz
);

-- ─── 12_Deployments ───────────────────────────────────────────
create table deployments (
  deploy_id         text primary key,
  order_id          text references orders(order_id) on delete cascade,
  order_name        text,
  line_id           text,
  sku               text,
  product_name      text,
  qty               numeric default 0,
  unit_price        numeric default 0,
  fb_done           boolean default false,
  fb_done_at        timestamptz,
  fb_links          text,
  shopee_done       boolean default false,
  shopee_done_at    timestamptz,
  shopee_links      text,
  tiktok_done       boolean default false,
  tiktok_done_at    timestamptz,
  tiktok_links      text,
  web_done          boolean default false,
  web_done_at       timestamptz,
  web_links         text,
  status            text default 'PENDING',
  created_at        timestamptz default now(),
  done_at           timestamptz,
  created_by        text,
  product_desc      text,
  sell_price        numeric default 0,
  price_approved_by text,
  info_done         boolean default false
);
create index idx_deployments_order  on deployments(order_id);
create index idx_deployments_status on deployments(status);

-- ─── 13_AdsCache (Facebook Ads) ───────────────────────────────
create table ads_cache (
  id               text primary key default gen_random_uuid()::text,
  date             date not null,
  ad_account_id    text not null,
  account_name     text,
  spend            numeric default 0,
  impressions      bigint default 0,
  clicks           bigint default 0,
  reach            bigint default 0,
  purchase_value   numeric default 0,
  synced_at        timestamptz default now(),
  is_today         boolean default false,
  unique (date, ad_account_id)
);
create index idx_ads_cache_date on ads_cache(date desc);

-- ─── 14_InsightsCache (FB Page Insights) ──────────────────────
create table insights_cache (
  id            text primary key default gen_random_uuid()::text,
  date          date not null,
  page_id       text not null,
  page_name     text,
  new_fans      integer default 0,
  lost_fans     integer default 0,
  net_fans      integer default 0,
  reach         bigint default 0,
  impressions   bigint default 0,
  synced_at     timestamptz default now(),
  unique (date, page_id)
);
create index idx_insights_cache_date on insights_cache(date desc);

-- ─── 15_TikTokAds ─────────────────────────────────────────────
create table tiktok_ads (
  id                text primary key default gen_random_uuid()::text,
  date              date not null,
  advertiser_id     text not null,
  advertiser_name   text,
  spend             numeric default 0,
  impressions       bigint default 0,
  clicks            bigint default 0,
  reach             bigint default 0,
  conversions       integer default 0,
  conversion_value  numeric default 0,
  synced_at         timestamptz default now(),
  unique (date, advertiser_id)
);
create index idx_tiktok_ads_date on tiktok_ads(date desc);

-- ─── 16_TikTokChannel ─────────────────────────────────────────
create table tiktok_channel (
  id              text primary key default gen_random_uuid()::text,
  date            date not null,
  account_id      text not null,
  username        text,
  followers       integer default 0,
  new_followers   integer default 0,
  video_views     bigint default 0,
  likes           bigint default 0,
  comments        bigint default 0,
  shares          bigint default 0,
  synced_at       timestamptz default now(),
  unique (date, account_id)
);

-- ─── 17_TikTokShop (orders + summaries) ───────────────────────
create table tiktok_shop_orders (
  id              text primary key default gen_random_uuid()::text,
  shop_id         text,
  order_id        text,
  order_status    text,
  buyer_email     text,
  total_amount    numeric default 0,
  currency        text,
  order_date      timestamptz,
  synced_at       timestamptz default now(),
  raw             jsonb,
  unique (shop_id, order_id)
);
create index idx_tkts_orders_date on tiktok_shop_orders(order_date desc);

create table tiktok_shop_returns (
  id              text primary key default gen_random_uuid()::text,
  shop_id         text,
  return_id       text,
  order_id        text,
  status          text,
  reason          text,
  refund_amount   numeric default 0,
  created_at      timestamptz,
  synced_at       timestamptz default now(),
  raw             jsonb,
  unique (shop_id, return_id)
);

-- ─── 18_RD (R&D Module) ───────────────────────────────────────
create table rd_items (
  id              text primary key default gen_random_uuid()::text,
  name            text,
  source_url      text,
  stage           text,            -- IDEA | FETCHED | ANALYZING | READY | DROPPED
  data            jsonb,           -- fetched product data + analysis
  note            text,
  created_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── 19_Customers (tổng hợp từ Nhanh đơn hàng) ────────────────
create table customers (
  customer_id       text primary key,
  name              text,
  phone             text,
  email             text,
  birthday          date,
  gender            text,
  address           text,
  city              text,
  total_orders      integer default 0,
  total_revenue     numeric default 0,
  last_order_date   date,
  created_at        timestamptz default now(),
  synced_at         timestamptz default now(),
  channels          text             -- CSV
);
create index idx_customers_phone on customers(phone);

-- ─── 20_ShopeeAds ─────────────────────────────────────────────
create table shopee_ads (
  id              text primary key default gen_random_uuid()::text,
  date            date not null,
  campaign_name   text,
  ad_type         text,
  spend           numeric default 0,
  impressions     bigint default 0,
  clicks          bigint default 0,
  orders          integer default 0,
  revenue         numeric default 0,
  roas            numeric default 0,
  synced_at       timestamptz default now(),
  shop            text,
  period_from     date,
  period_to       date
);
create index idx_shopee_ads_date on shopee_ads(date desc, shop);

-- ─── 21_ShopeeDaily ───────────────────────────────────────────
create table shopee_daily (
  date        date not null,
  shop_id     text not null,
  revenue     numeric default 0,
  orders      integer default 0,
  synced_at   timestamptz default now(),
  primary key (date, shop_id)
);

-- ─── 22_ReturnLog / 22_ReturnEditLog ──────────────────────────
create table return_log (
  token           text primary key,
  date            date,
  product_name    text,
  sku             text,
  category        text,
  condition       text,
  description     text,
  basket          text,
  cost            numeric default 0,
  repair_cost     numeric default 0,
  sell_price      numeric default 0,
  status          text,
  customer_name   text,
  phone           text,
  tracking        text,
  channel_sold    text,
  loss            numeric default 0,
  created_by      text,
  created_at      timestamptz default now(),
  sold_at         timestamptz,
  note            text,
  images          text            -- CSV URLs
);

create table return_edit_log (
  log_id          text primary key default gen_random_uuid()::text,
  action          text,
  token           text,
  product_name    text,
  field_changed   text,
  old_value       text,
  new_value       text,
  changed_by      text,
  changed_at      timestamptz default now(),
  note            text
);

-- ─── 24_SkuInfoLog ────────────────────────────────────────────
create table sku_info_log (
  id              text primary key default gen_random_uuid()::text,
  sku             text not null,
  product_desc    text,
  sell_price      numeric default 0,
  ref_links       text,
  market_low      numeric default 0,
  market_high     numeric default 0,
  market_avg      numeric default 0,
  done_by         text,
  done_at         timestamptz default now(),
  deploy_id       text,
  note            text
);
create index idx_sku_info_sku on sku_info_log(sku, done_at desc);

-- ─── Tasks Manager (phase 4 pre-provisioned) ──────────────────
create table tasks (
  task_id         text primary key default gen_random_uuid()::text,
  title           text,
  description     text,
  assignee_email  text,
  created_by      text,
  status          text default 'OPEN',      -- OPEN | IN_PROGRESS | DONE | CANCELLED
  priority        text,                      -- LOW | MEDIUM | HIGH | URGENT
  deadline        timestamptz,
  recurring       text,                      -- null | DAILY | WEEKLY | MONTHLY
  parent_task_id  text,
  alerted_1h      boolean default false,
  alerted_overdue boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  done_at         timestamptz
);
create index idx_tasks_assignee on tasks(assignee_email, status);

create table tasks_log (
  log_id        text primary key default gen_random_uuid()::text,
  task_id       text,
  task_title    text,
  field         text,
  old_value     text,
  new_value     text,
  changed_by    text,
  changed_by_email text,
  changed_at    timestamptz default now()
);

-- ─── Sales Plan / Launch Plan (phase 4) ───────────────────────
create table sales_plan (
  id              text primary key default gen_random_uuid()::text,
  sku             text,
  product_name    text,
  month_key       text,
  channel         text,
  qty_target      numeric default 0,
  rev_target      numeric default 0,
  status          text,
  note            text,
  created_by      text,
  created_at      timestamptz default now()
);

create table launch_plan (
  id              text primary key default gen_random_uuid()::text,
  sku             text,
  product_name    text,
  stage           text,           -- DRAFT | READY | LAUNCHED | POSTPONED
  launch_date     date,
  channels        text,
  metrics         jsonb,
  note            text,
  created_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── OTP codes (auth) ────────────────────────────────────────
create table otp_codes (
  email       text primary key,
  code_hash   text not null,       -- sha256(code)
  expires_at  timestamptz not null,
  attempts    integer default 0,
  created_at  timestamptz default now()
);

-- ─── Auth sessions (server-issued, HttpOnly cookie payload) ──
create table user_sessions (
  token_hash  text primary key,
  email       text not null references users(email) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz default now(),
  user_agent  text,
  ip          text
);
create index idx_user_sessions_email on user_sessions(email);

-- ─── Pending notifications (approval flow emails) ────────────
create table pending_notifications (
  id          text primary key default gen_random_uuid()::text,
  to_emails   text,           -- CSV
  order_id    text,
  type        text,           -- UNLOCK_REQUEST | UNLOCK_APPROVED | ...
  payload     jsonb,
  sent        boolean default false,
  created_at  timestamptz default now()
);

-- ─── Error log (ported from _writeLog_) ──────────────────────
create table error_log (
  id            text primary key default gen_random_uuid()::text,
  type          text,
  date_from     date,
  date_to       date,
  detail        text,
  created_at    timestamptz default now()
);

-- ─── Imported files (Drive folder dedup) ─────────────────────
create table imported_files (
  file_id     text primary key,
  file_date   date,
  row_count   integer default 0,
  imported_at timestamptz default now()
);

-- ─── WebApp page config (per-WA page: ad_accounts + sources) ─
create table webapp_page_config (
  page_key      text primary key,
  ad_accounts   text,        -- CSV
  sources       text,        -- CSV (Website / Haravan / Sapo / API)
  updated_at    timestamptz default now()
);

-- ─── RLS (Phase 0: enable but keep permissive until per-role policies land in Phase 1) ──
-- We rely on route handlers enforcing auth via cookie session + service-role client
-- for admin ops. RLS stays enabled to prevent accidental anon access if service key leaks.
alter table config                    enable row level security;
alter table orders                    enable row level security;
alter table items                     enable row level security;
alter table budgets                   enable row level security;
alter table suppliers                 enable row level security;
alter table users                     enable row level security;
alter table targets                   enable row level security;
alter table pages                     enable row level security;
alter table assignments               enable row level security;
alter table sales_sync                enable row level security;
alter table inventory                 enable row level security;
alter table products                  enable row level security;
alter table deployments               enable row level security;
alter table ads_cache                 enable row level security;
alter table insights_cache            enable row level security;
alter table tiktok_ads                enable row level security;
alter table tiktok_channel            enable row level security;
alter table tiktok_shop_orders        enable row level security;
alter table tiktok_shop_returns       enable row level security;
alter table rd_items                  enable row level security;
alter table customers                 enable row level security;
alter table shopee_ads                enable row level security;
alter table shopee_daily              enable row level security;
alter table return_log                enable row level security;
alter table return_edit_log           enable row level security;
alter table sku_info_log              enable row level security;
alter table tasks                     enable row level security;
alter table tasks_log                 enable row level security;
alter table sales_plan                enable row level security;
alter table launch_plan               enable row level security;
alter table otp_codes                 enable row level security;
alter table user_sessions             enable row level security;
alter table pending_notifications     enable row level security;
alter table error_log                 enable row level security;
alter table imported_files            enable row level security;
alter table webapp_page_config        enable row level security;

-- Phase 0 uses service-role key server-side, so no permissive policies needed.
-- Per-role policies (BUY can edit DRAFT orders, TECH can only update QC fields, etc.)
-- land with each module in Phase 1+.
