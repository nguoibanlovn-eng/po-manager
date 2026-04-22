import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TiktokProductStat = {
  name: string;
  shop: string;
  sold: number;
  revenue: number;
  cancel: number;
  cancel_rate: number;
};

const CANCEL_STATUSES = new Set(["CANCELLED", "RETURNED", "RETURN_REQUEST"]);
const SOLD_STATUSES = new Set(["COMPLETED", "DELIVERED", "IN_TRANSIT", "AWAITING_COLLECTION"]);

// Aggregate product-level stats từ tiktok_shop_orders.raw (JSONB).
export async function getTiktokProductStats(opts: { from?: string; to?: string } = {}): Promise<{
  products: TiktokProductStat[];
  shops: string[];
}> {
  const db = supabaseAdmin();
  const to = opts.to ? new Date(opts.to + "T23:59:59Z") : new Date();
  const from = opts.from ? new Date(opts.from + "T00:00:00Z") : new Date(Date.now() - 30 * 86400_000);

  const { data: orders = [] } = await db
    .from("tiktok_shop_orders")
    .select("shop_id, order_status, raw")
    .gte("order_date", from.toISOString())
    .lte("order_date", to.toISOString())
    .limit(50000);

  // Lookup shop names
  const { data: shopsData = [] } = await db.from("tktshop_shops").select("shop_id, name");
  const shopMap = new Map((shopsData || []).map((s) => [s.shop_id, s.name || s.shop_id]));

  const products = new Map<string, TiktokProductStat>();
  const shopSet = new Set<string>();

  for (const o of orders || []) {
    const st = String(o.order_status || "").toUpperCase();
    const shopName = shopMap.get(o.shop_id) || o.shop_id;
    shopSet.add(shopName);
    const raw = o.raw as { line_items?: Array<{ product_name?: string; name?: string; sku_name?: string; quantity?: number; original_price?: string | number; sale_price?: string | number }> } | null;
    const items = raw?.line_items || [];
    for (const it of items) {
      const name = String(it.product_name || it.name || it.sku_name || "").trim();
      if (!name) continue;
      const qty = Number(it.quantity || 1);
      const price = Number(it.sale_price || it.original_price || 0);
      const cur = products.get(name) || { name, shop: shopName, sold: 0, revenue: 0, cancel: 0, cancel_rate: 0 };
      if (CANCEL_STATUSES.has(st)) {
        cur.cancel += qty;
      } else if (SOLD_STATUSES.has(st)) {
        cur.sold += qty;
        cur.revenue += qty * price;
      }
      products.set(name, cur);
    }
  }

  const result = Array.from(products.values())
    .map((p) => {
      const total = p.sold + p.cancel;
      p.cancel_rate = total > 0 ? Math.round((p.cancel / total) * 100) : 0;
      return p;
    })
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 200);

  return { products: result, shops: Array.from(shopSet).sort() };
}

export type TiktokAdsRow = {
  date: string;
  advertiser_id: string;
  advertiser_name: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  conversions: number | null;
  conversion_value: number | null;
  synced_at: string | null;
};

export type TiktokChannelRow = {
  date: string;
  account_id: string;
  username: string | null;
  followers: number | null;
  new_followers: number | null;
  video_views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

// Doanh thu TikTok Shop từ nhanh.vn sales_sync
export type TiktokNhanhRow = {
  date: string;
  source: string;
  revenue: number;
  orders: number;
};

export async function listTiktokNhanhRevenue(from: string, to: string): Promise<TiktokNhanhRow[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("sales_sync")
    .select("period_from, source, revenue_net, order_net")
    .eq("channel", "TikTok")
    .gte("period_from", from)
    .lte("period_from", to)
    .order("period_from", { ascending: true })
    .limit(500);
  return (data || []).map((r) => ({
    date: r.period_from,
    source: r.source || "",
    revenue: Number(r.revenue_net || 0),
    orders: Number(r.order_net || 0),
  }));
}

// Get channel target for a given month
export async function getChannelTarget(channel: string, monthKey: string): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("targets")
    .select("rev_target")
    .eq("type", "channel")
    .eq("ref_id", channel)
    .eq("month_key", monthKey)
    .maybeSingle();
  return Number(data?.rev_target || 0);
}

export async function listTiktokAds(from?: string, to?: string): Promise<TiktokAdsRow[]> {
  const db = supabaseAdmin();
  let q = db.from("tiktok_ads").select("*").order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q.limit(2000);
  return (data as TiktokAdsRow[]) || [];
}

export async function listTiktokChannels(from?: string, to?: string): Promise<TiktokChannelRow[]> {
  const db = supabaseAdmin();
  let q = db.from("tiktok_channel").select("*").order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q.limit(1000);
  return (data as TiktokChannelRow[]) || [];
}

// ── GMV Max ──

export type GmvMaxRow = {
  date: string;
  store_id: string;
  store_name: string | null;
  store_code: string | null;
  spend: number;
  gross_revenue: number;
  roi: number;
  orders: number;
  cost_per_order: number;
};

export type GmvMaxProductRow = {
  date: string;
  store_id: string;
  item_group_id: string;
  campaign_id: string | null;
  spend: number;
  gross_revenue: number;
  roi: number;
  orders: number;
  cost_per_order: number;
};

export async function listGmvMax(from: string, to: string): Promise<GmvMaxRow[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("tiktok_gmv_max")
    .select("date,store_id,store_name,store_code,spend,gross_revenue,roi,orders,cost_per_order")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .limit(2000);
  return (data as GmvMaxRow[]) || [];
}

export async function listGmvMaxProducts(from: string, to: string): Promise<GmvMaxProductRow[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("tiktok_gmv_max_products")
    .select("date,store_id,item_group_id,campaign_id,spend,gross_revenue,roi,orders,cost_per_order")
    .gte("date", from)
    .lte("date", to)
    .order("gross_revenue", { ascending: false })
    .limit(500);
  return (data as GmvMaxProductRow[]) || [];
}
