import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AdsRow = {
  date: string;
  ad_account_id: string;
  account_name: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  purchase_value: number | null;
  synced_at: string | null;
  is_today: boolean | null;
};

export type InsightsRow = {
  date: string;
  page_id: string;
  page_name: string | null;
  new_fans: number | null;
  lost_fans: number | null;
  net_fans: number | null;
  reach: number | null;
  impressions: number | null;
  synced_at: string | null;
};

export type PageRow = {
  page_id: string;
  page_name: string | null;
  platform: string | null;
  assigned_email: string | null;
  assigned_name: string | null;
  is_active: boolean | null;
  nhanh_id: string | null;
  ad_account_id: string | null;
  fb_page_id: string | null;
  last_sync: string | null;
};

export async function listPages(platform?: string): Promise<PageRow[]> {
  const db = supabaseAdmin();
  let q = db.from("pages").select("*").eq("is_active", true);
  if (platform) q = q.eq("platform", platform);
  const { data } = await q.order("page_name", { ascending: true });
  return (data as PageRow[]) || [];
}

export async function listAdsCache(opts: {
  from?: string;
  to?: string;
  accountId?: string;
} = {}): Promise<AdsRow[]> {
  const db = supabaseAdmin();
  let q = db.from("ads_cache").select("*").order("date", { ascending: false });
  if (opts.from) q = q.gte("date", opts.from);
  if (opts.to) q = q.lte("date", opts.to);
  if (opts.accountId) q = q.eq("ad_account_id", opts.accountId);
  const { data } = await q.limit(2000);
  return (data as AdsRow[]) || [];
}

export async function listInsightsCache(opts: {
  from?: string;
  to?: string;
  pageId?: string;
} = {}): Promise<InsightsRow[]> {
  const db = supabaseAdmin();
  let q = db.from("insights_cache").select("*").order("date", { ascending: false });
  if (opts.from) q = q.gte("date", opts.from);
  if (opts.to) q = q.lte("date", opts.to);
  if (opts.pageId) q = q.eq("page_id", opts.pageId);
  const { data } = await q.limit(2000);
  return (data as InsightsRow[]) || [];
}

export function summarizeAds(rows: AdsRow[]) {
  return rows.reduce(
    (acc, r) => ({
      spend: acc.spend + Number(r.spend || 0),
      impressions: acc.impressions + Number(r.impressions || 0),
      clicks: acc.clicks + Number(r.clicks || 0),
      reach: acc.reach + Number(r.reach || 0),
      purchase_value: acc.purchase_value + Number(r.purchase_value || 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, reach: 0, purchase_value: 0 },
  );
}
