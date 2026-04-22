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

export type InventoryStats = {
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  totalStock: number;
  totalValue: number;
  categories: string[];
};

export async function getInventoryStats(): Promise<InventoryStats> {
  const db = supabaseAdmin();

  // Parallel queries
  const [totalRes, inStockRes, outStockRes, catRes] = await Promise.all([
    db.from("products").select("*", { count: "exact", head: true }),
    db.from("products").select("stock, cost_price").gt("stock", 0),
    db.from("products").select("*", { count: "exact", head: true }).lte("stock", 0),
    db.from("products").select("category").not("category", "is", null),
  ]);

  let totalStock = 0, totalValue = 0;
  for (const r of (inStockRes.data || []) as Array<{ stock: number; cost_price: number }>) {
    totalStock += Number(r.stock || 0);
    totalValue += Number(r.stock || 0) * Number(r.cost_price || 0);
  }

  const catSet = new Set<string>();
  for (const r of (catRes.data || []) as Array<{ category: string }>) {
    if (r.category) catSet.add(r.category);
  }

  return {
    totalProducts: totalRes.count || 0,
    inStock: (inStockRes.data || []).length,
    outOfStock: outStockRes.count || 0,
    totalStock,
    totalValue,
    categories: Array.from(catSet).sort(),
  };
}

/** Mobile inventory summary: top sellers, slow movers, no sales */
export async function getInventoryMobileSummary(): Promise<{
  topSellers: { sku: string; name: string; category: string; stock: number; sold: number }[];
  noSales: { sku: string; name: string; category: string; stock: number; costValue: number }[];
  slowMovers: { sku: string; name: string; category: string; stock: number; sold: number; pctSold: number }[];
  stats: { total: number; inStock: number; outOfStock: number; lowStock: number };
}> {
  const db = supabaseAdmin();

  const { data: all } = await db
    .from("inventory")
    .select("sku, product_name, category, available_qty, sold_30d")
    .order("sold_30d", { ascending: false })
    .limit(5000);

  const { data: products } = await db
    .from("products")
    .select("sku, cost_price, stock")
    .limit(5000);

  const costMap = new Map<string, number>();
  for (const p of products || []) {
    if (p.sku) costMap.set(String(p.sku), Number(p.cost_price || 0));
  }

  const rows = (all || []).map(r => ({
    sku: String(r.sku || ""),
    name: String(r.product_name || ""),
    category: String(r.category || ""),
    stock: Number(r.available_qty || 0),
    sold: Number(r.sold_30d || 0),
    cost: costMap.get(String(r.sku || "")) || 0,
  }));

  const total = rows.length;
  const inStock = rows.filter(r => r.stock > 0).length;
  const outOfStock = rows.filter(r => r.stock <= 0).length;
  const lowStock = rows.filter(r => r.stock > 0 && r.stock <= 5).length;

  // Top sellers: sold > 0, sort by sold desc
  const topSellers = rows
    .filter(r => r.sold > 0)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 15)
    .map(r => ({ sku: r.sku, name: r.name, category: r.category, stock: r.stock, sold: r.sold }));

  // No sales: stock > 0 but sold = 0
  const noSales = rows
    .filter(r => r.stock > 0 && r.sold <= 0)
    .sort((a, b) => (b.stock * b.cost) - (a.stock * a.cost))
    .slice(0, 15)
    .map(r => ({ sku: r.sku, name: r.name, category: r.category, stock: r.stock, costValue: r.stock * r.cost }));

  // Slow movers: sold > 0 but low ratio (sold/stock < 50%), stock > 5
  const slowMovers = rows
    .filter(r => r.sold > 0 && r.stock > 5)
    .map(r => ({ ...r, pctSold: r.stock > 0 ? Math.round(r.sold / (r.stock + r.sold) * 100) : 0 }))
    .filter(r => r.pctSold < 30)
    .sort((a, b) => a.pctSold - b.pctSold)
    .slice(0, 15)
    .map(r => ({ sku: r.sku, name: r.name, category: r.category, stock: r.stock, sold: r.sold, pctSold: r.pctSold }));

  return {
    topSellers,
    noSales,
    slowMovers,
    stats: { total, inStock, outOfStock, lowStock },
  };
}

export async function listInventory(opts: {
  search?: string;
  filter?: "all" | "in_stock" | "low_stock" | "out_of_stock" | "active" | "inactive";
  category?: string;
  sort?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: InventoryRow[]; total: number }> {
  const { search, filter = "all", category, sort = "stock_desc", limit = 200, offset = 0 } = opts;
  const db = supabaseAdmin();

  let q = db
    .from("products")
    .select("id, sku, product_name, category, stock, cost_price, sell_price, is_active, last_sync", { count: "exact" });

  if (search) {
    q = q.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`);
  }
  if (category) q = q.eq("category", category);
  if (filter === "out_of_stock") q = q.lte("stock", 0);
  else if (filter === "low_stock") q = q.gt("stock", 0).lte("stock", 10);
  else if (filter === "in_stock") q = q.gt("stock", 0);
  else if (filter === "active") q = q.eq("is_active", true);
  else if (filter === "inactive") q = q.eq("is_active", false);

  // Sort
  if (sort === "stock_asc") q = q.order("stock", { ascending: true });
  else if (sort === "value_desc") q = q.order("cost_price", { ascending: false }).order("stock", { ascending: false });
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
