-- Add SSC + KHO TRỮ breakdown columns to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_kho_tru integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_ssc integer NOT NULL DEFAULT 0;

-- stock = stock_kho_tru + stock_ssc (computed on sync, not trigger)
COMMENT ON COLUMN products.stock_kho_tru IS 'Tồn kho KHO TRỮ HÀNG VELASBOOST (Nhanh depot 205665)';
COMMENT ON COLUMN products.stock_ssc IS 'Tồn kho SSC fulfillment (ssc.eco)';
