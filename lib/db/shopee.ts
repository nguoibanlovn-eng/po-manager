import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ShopeeAdsRow = {
  id: string;
  date: string;
  campaign_name: string | null;
  ad_type: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  orders: number | null;
  revenue: number | null;
  roas: number | null;
  synced_at: string | null;
  shop: string | null;
  period_from: string | null;
  period_to: string | null;
};

export type ShopeeDailyRow = {
  date: string;
  shop_id: string;
  revenue: number | null;
  orders: number | null;
  synced_at: string | null;
};

export async function listShopeeAds(opts: {
  monthKey?: string;
  from?: string;
  to?: string;
  shop?: string;
} = {}): Promise<ShopeeAdsRow[]> {
  const db = supabaseAdmin();
  // Build filter — use gte + lt (not lte) because date column is DATE type
  const filters: { from?: string; to?: string } = {};
  if (opts.from && opts.to) {
    filters.from = opts.from;
    // Add 1 day to 'to' for lt comparison
    const toDate = new Date(opts.to + "T00:00:00Z");
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    filters.to = toDate.toISOString().substring(0, 10);
  } else if (opts.monthKey) {
    filters.from = `${opts.monthKey}-01`;
    const [y, m] = opts.monthKey.split("-").map(Number);
    filters.to = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (m === 12) filters.to = `${y + 1}-01-01`;
  }

  // Paginate to bypass Supabase 1000 row limit
  const all: ShopeeAdsRow[] = [];
  for (let page = 0; page < 10; page++) {
    let q = db.from("shopee_ads").select("*");
    if (filters.from) q = q.gte("date", filters.from);
    if (filters.to) q = q.lt("date", filters.to);
    if (opts.shop) q = q.eq("shop", opts.shop);
    const { data } = await q.range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as ShopeeAdsRow[]));
    if (data.length < 1000) break;
  }
  return all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function listShopeeDaily(monthKey?: string): Promise<ShopeeDailyRow[]> {
  const db = supabaseAdmin();
  let q = db.from("shopee_daily").select("*").order("date", { ascending: false });
  if (monthKey) {
    q = q.gte("date", `${monthKey}-01`).lt("date", `${monthKey}-31`);
  }
  const { data } = await q;
  return (data as ShopeeDailyRow[]) || [];
}

export async function listShops(): Promise<string[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("shopee_ads").select("shop").not("shop", "is", null);
  const set = new Set<string>();
  for (const r of data || []) if (r.shop) set.add(String(r.shop));
  return Array.from(set).sort();
}
