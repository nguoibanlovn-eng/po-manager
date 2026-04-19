import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Tính lại total_orders + total_revenue cho customers từ product_sales.
 * Group by customer_id → count distinct order_id, sum revenue.
 */
export async function refreshCustomerStats(): Promise<{ updated: number }> {
  const db = supabaseAdmin();

  // 1. Fetch all product_sales with customer_id
  const salesMap = new Map<string, { orders: Set<string>; revenue: number; lastDate: string }>();
  let off = 0;
  const PG = 1000;

  while (true) {
    const { data } = await db.from("product_sales")
      .select("customer_id, order_id, revenue, date")
      .not("customer_id", "is", null)
      .neq("customer_id", "")
      .range(off, off + PG - 1);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const cid = String(r.customer_id);
      if (!cid) continue;
      const cur = salesMap.get(cid) || { orders: new Set<string>(), revenue: 0, lastDate: "" };
      cur.orders.add(String(r.order_id));
      cur.revenue += Number(r.revenue || 0);
      if (r.date > cur.lastDate) cur.lastDate = r.date;
      salesMap.set(cid, cur);
    }

    if (data.length < PG) break;
    off += PG;
  }

  if (salesMap.size === 0) return { updated: 0 };

  // 2. Batch update customers
  let updated = 0;
  const entries = Array.from(salesMap.entries());
  const BATCH = 100;

  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    for (const [customerId, stats] of chunk) {
      const { error } = await db.from("customers")
        .update({
          total_orders: stats.orders.size,
          total_revenue: Math.round(stats.revenue),
          last_order_date: stats.lastDate || null,
        })
        .eq("customer_id", customerId);
      if (!error) updated++;
    }
  }

  return { updated };
}
