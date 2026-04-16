-- Nhanh.vn trả về nhiều variant share cùng barcode. Giữ mỗi row là 1 product
-- theo id của Nhanh thay vì unique theo SKU.

-- Drop old PK, truncate (resync ngay sau đó), rebuild.
truncate table products;

alter table products drop constraint if exists products_pkey;
alter table products add column if not exists id bigint;
alter table products alter column id set not null;
alter table products add constraint products_pkey primary key (id);

create index if not exists idx_products_sku on products(sku);
create index if not exists idx_products_barcode on products(sku);
