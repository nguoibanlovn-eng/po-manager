-- Aggregate product_sales by SKU with sell_price from products table
CREATE OR REPLACE FUNCTION get_sales_summary(
  p_from date,
  p_to date,
  p_channel text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  sku text,
  product_name text,
  channels text,
  qty bigint,
  orders bigint,
  revenue numeric,
  sell_price numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ps.sku,
    MAX(ps.product_name) AS product_name,
    STRING_AGG(DISTINCT ps.channel_name, ', ') AS channels,
    SUM(ps.qty)::bigint AS qty,
    COUNT(*)::bigint AS orders,
    SUM(ps.revenue) AS revenue,
    COALESCE(MAX(p.sell_price), 0) AS sell_price
  FROM product_sales ps
  LEFT JOIN products p ON p.sku = ps.sku
  WHERE ps.date >= p_from
    AND ps.date <= p_to
    AND (p_channel IS NULL OR ps.channel_name = p_channel)
    AND (p_search IS NULL OR ps.sku ILIKE '%' || p_search || '%' OR ps.product_name ILIKE '%' || p_search || '%')
  GROUP BY ps.sku;
$$;

-- Distinct channels for filter dropdown
CREATE OR REPLACE FUNCTION get_sales_channels(p_from date, p_to date)
RETURNS TABLE (channel_name text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ps.channel_name
  FROM product_sales ps
  WHERE ps.date >= p_from AND ps.date <= p_to AND ps.channel_name IS NOT NULL AND ps.channel_name != ''
  ORDER BY ps.channel_name;
$$;
