-- Add revenue_expected column: Đơn tạo - Hoàn hủy (from orderDate=create report)
alter table sales_sync add column if not exists revenue_expected numeric default 0;
