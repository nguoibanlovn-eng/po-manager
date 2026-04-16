-- Some legacy rows in 10_Sales_Sync contain fractional values in the
-- count columns. Relax integer → numeric.
alter table sales_sync
  alter column order_total   type numeric,
  alter column order_cancel  type numeric,
  alter column order_net     type numeric,
  alter column order_success type numeric;
