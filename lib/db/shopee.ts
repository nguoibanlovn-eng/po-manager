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
  let q = db.from("shopee_ads").select("*").order("date", { ascending: false });
  if (opts.from && opts.to) {
    q = q.gte("date", opts.from).lte("date", opts.to);
  } else if (opts.monthKey) {
    const from = `${opts.monthKey}-01`;
    const [y, m] = opts.monthKey.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${opts.monthKey}-${String(lastDay).padStart(2, "0")}`;
    q = q.gte("date", from).lte("date", to);
  }
  if (opts.shop) q = q.eq("shop", opts.shop);
  const { data } = await q.limit(10000);
  return (data as ShopeeAdsRow[]) || [];
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
