import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type InventoryRow = {
  sku: string;
  product_name: string | null;
  category: string | null;
  available_qty: number | null;
  in_transit_qty: number | null;
  total_qty: number | null;
  reserved_qty: number | null;
  sold_30d: number | null;
  last_sync: string | null;
  cost_price?: number | null;
  sell_price?: number | null;
};

export async function listInventory(opts: {
  search?: string;
  filter?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: InventoryRow[]; total: number }> {
  const { search, filter = "all", limit = 200, offset = 0 } = opts;
  const db = supabaseAdmin();
  let q = db
    .from("inventory")
    .select("*", { count: "exact" })
    .order("available_qty", { ascending: false });

  if (search) {
    q = q.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`);
  }
  if (filter === "out_of_stock") q = q.lte("available_qty", 0);
  else if (filter === "low_stock") q = q.gt("available_qty", 0).lte("available_qty", 5);
  else if (filter === "in_stock") q = q.gt("available_qty", 0);

  const { data, count } = await q.range(offset, offset + limit - 1);
  const rows = (data as InventoryRow[]) || [];

  // Enrich with price data from products table
  if (rows.length > 0) {
    const skus = rows.map((r) => r.sku);
    const { data: prods } = await db
      .from("products")
      .select("sku, cost_price, sell_price")
      .in("sku", skus);
    if (prods) {
      const priceMap = new Map(prods.map((p) => [p.sku, p]));
      for (const r of rows) {
        const p = priceMap.get(r.sku);
        if (p) {
          r.cost_price = p.cost_price;
          r.sell_price = p.sell_price;
        }
      }
    }
  }

  return { rows, total: count || 0 };
}
