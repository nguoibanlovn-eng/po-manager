-- Add customer_id to product_sales for linking orders to customers
ALTER TABLE product_sales ADD COLUMN IF NOT EXISTS customer_id text;
CREATE INDEX IF NOT EXISTS idx_product_sales_customer ON product_sales(customer_id);
