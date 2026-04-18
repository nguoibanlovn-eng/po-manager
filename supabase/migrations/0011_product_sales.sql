-- Product-level sales data (from Nhanh.vn order items)
-- One row per SKU per order — for "Bảng 1: Dữ liệu bán hàng"
create table if not exists product_sales (
  id              uuid default gen_random_uuid() primary key,
  date            date not null,
  sku             text not null,
  product_name    text,
  order_id        text not null,
  channel         text,
  channel_name    text,
  qty             numeric default 0,
  unit_price      numeric default 0,
  revenue         numeric default 0,
  status          text,
  synced_at       timestamptz default now(),
  unique (order_id, sku)
);

create index if not exists idx_product_sales_date on product_sales(date);
create index if not exists idx_product_sales_sku on product_sales(sku);
