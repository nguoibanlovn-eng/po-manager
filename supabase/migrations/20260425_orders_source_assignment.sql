-- Add source tracking, assignment, and deadline to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS biz_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_stage ON orders(stage);

-- Backfill: mark orders created from biz_orders
UPDATE orders o
SET source = 'biz_order', biz_order_id = bo.id
FROM biz_orders bo
WHERE bo.po_order_id = o.order_id AND bo.status = 'approved';
