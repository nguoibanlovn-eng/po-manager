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

export type FbNhanhRow = { date: string; source: string; revenue: number; orders: number; revenue_expected: number };

export async function listFbNhanhRevenue(from: string, to: string): Promise<FbNhanhRow[]> {
  const db = supabaseAdmin();
  const all: FbNhanhRow[] = [];
  let off = 0;
  const PG = 1000;
  while (true) {
    const { data } = await db
      .from("sales_sync")
      .select("period_from, source, revenue_net, order_net, revenue_expected")
      .eq("channel", "Facebook")
      .gte("period_from", from)
      .lte("period_from", to)
      .order("period_from", { ascending: true })
      .range(off, off + PG - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      all.push({
        date: r.period_from,
        source: r.source || "",
        revenue: Number(r.revenue_net || 0),
        orders: Number(r.order_net || 0),
        revenue_expected: Number(r.revenue_expected || 0),
      });
    }
    if (data.length < PG) break;
    off += PG;
  }
  return all;
}

export async function listWebNhanhRevenue(from: string, to: string): Promise<FbNhanhRow[]> {
  const db = supabaseAdmin();
  type SyncRow = { period_from: string; source: string; revenue_net: number; order_net: number; revenue_expected: number };
  const PG = 1000;

  // Paginate API channel
  const apiData: SyncRow[] = [];
  let apiOff = 0;
  while (true) {
    const { data: page } = await db
      .from("sales_sync")
      .select("period_from, source, revenue_net, order_net, revenue_expected")
      .eq("channel", "API")
      .gte("period_from", from)
      .lte("period_from", to)
      .order("period_from", { ascending: true })
      .range(apiOff, apiOff + PG - 1);
    if (!page || page.length === 0) break;
    apiData.push(...page);
    if (page.length < PG) break;
    apiOff += PG;
  }
  // Filter: include web-keyword sources OR generic "API" source (V3 sync)
  const webApiData = apiData.filter((r) => {
    const src = (r.source || "").toLowerCase();
    return src === "api" || ["lovu", "velasboost", "app lỗ vũ", "web", "muagimuadi", "lynkid", "bán sỉ"].some((kw) => src.includes(kw));
  });

  // Paginate Admin channel
  const adminData: SyncRow[] = [];
  let admOff = 0;
  while (true) {
    const { data: page } = await db
      .from("sales_sync")
      .select("period_from, source, revenue_net, order_net, revenue_expected")
      .eq("channel", "Admin")
      .or("source.ilike.%DOANH THU%WEB%,source.ilike.%DOANH THU%lovu%,source.ilike.%DOANH THU%velasboost%,source.ilike.%DOANH THU%App Lỗ Vũ%,source.ilike.%DOANH THU%muagimuadi%,source.ilike.%DOANH THU%LynkID%,source.ilike.%WEB - Bán sỉ%")
      .gte("period_from", from)
      .lte("period_from", to)
      .order("period_from", { ascending: true })
      .range(admOff, admOff + PG - 1);
    if (!page || page.length === 0) break;
    adminData.push(...page);
    if (page.length < PG) break;
    admOff += PG;
  }

  // Exclude cost rows (CHI PHÍ) that slip through keyword filters
  const allRows = [...webApiData, ...adminData].filter(
    (r) => Number(r.revenue_net || 0) >= 0 || Number(r.order_net || 0) > 0,
  );
  return allRows.map((r) => ({
    date: r.period_from,
    source: r.source || "",
    revenue: Number(r.revenue_net || 0),
    orders: Number(r.order_net || 0),
    revenue_expected: Number(r.revenue_expected || 0),
  }));
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
