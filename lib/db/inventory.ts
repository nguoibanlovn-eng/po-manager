import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type InventoryRow = {
  id: number;
  sku: string;
  product_name: string | null;
  category: string | null;
  available_qty: number | null;
  cost_price: number | null;
  sell_price: number | null;
  is_active: boolean | null;
  last_sync: string | null;
};

export async function listInventory(opts: {
  search?: string;
  filter?: "all" | "in_stock" | "low_stock" | "out_of_stock" | "active" | "inactive";
  sort?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: InventoryRow[]; total: number }> {
  const { search, filter = "all", sort = "stock_desc", limit = 200, offset = 0 } = opts;
  const db = supabaseAdmin();

  // Đọc trực tiếp từ products table (1 row per product, không gom)
  let q = db
    .from("products")
    .select("id, sku, product_name, category, stock, cost_price, sell_price, is_active, last_sync", { count: "exact" });

  if (search) {
    q = q.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`);
  }
  if (filter === "out_of_stock") q = q.lte("stock", 0);
  else if (filter === "low_stock") q = q.gt("stock", 0).lte("stock", 5);
  else if (filter === "in_stock") q = q.gt("stock", 0);
  else if (filter === "active") q = q.eq("is_active", true);
  else if (filter === "inactive") q = q.eq("is_active", false);

  // Sort
  if (sort === "stock_desc") q = q.order("stock", { ascending: false });
  else if (sort === "stock_asc") q = q.order("stock", { ascending: true });
  else if (sort === "name_asc") q = q.order("product_name", { ascending: true });
  else q = q.order("stock", { ascending: false });

  const { data, count } = await q.range(offset, offset + limit - 1);
  const rows = ((data || []) as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    sku: String(r.sku || ""),
    product_name: r.product_name as string | null,
    category: r.category as string | null,
    available_qty: Number(r.stock || 0),
    cost_price: Number(r.cost_price || 0),
    sell_price: Number(r.sell_price || 0),
    is_active: r.is_active as boolean | null,
    last_sync: r.last_sync as string | null,
  }));

  return { rows, total: count || 0 };
}
