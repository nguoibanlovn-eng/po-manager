-- Business orders: team kinh doanh tạo yêu cầu nhập hàng → duyệt → tạo PO

CREATE TABLE IF NOT EXISTS biz_orders (
  id           TEXT PRIMARY KEY,
  order_type   TEXT NOT NULL DEFAULT 'new',          -- 'new' | 'existing'
  team         TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',        -- draft | pending | approved | rejected
  approver     TEXT,                                 -- email nguoi duyet
  approved_at  TIMESTAMPTZ,
  approval_note TEXT,
  order_total  NUMERIC DEFAULT 0,
  item_count   INT DEFAULT 0,
  total_qty    INT DEFAULT 0,
  po_order_id  TEXT,                                 -- FK orders.order_id sau khi duyet
  is_deleted   BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS biz_order_items (
  biz_order_id  TEXT NOT NULL REFERENCES biz_orders(id) ON DELETE CASCADE,
  line_id       TEXT NOT NULL,
  stt           INT DEFAULT 1,
  sku           TEXT,
  product_name  TEXT,
  qty           INT DEFAULT 0,
  unit_price    NUMERIC DEFAULT 0,
  sell_price    NUMERIC DEFAULT 0,
  description   TEXT,
  ref_link      TEXT,
  competitor_link TEXT,
  current_stock INT DEFAULT 0,
  is_deleted    BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (biz_order_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_biz_orders_status ON biz_orders(status);
CREATE INDEX IF NOT EXISTS idx_biz_orders_created_by ON biz_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_biz_orders_approver ON biz_orders(approver);
