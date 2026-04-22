import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { getAccessToken, validateTiktokToken } from "@/lib/tiktok/auth";

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

// All advertiser IDs that might have GMV Max stores
const ADVERTISER_IDS = (process.env.TIKTOK_ADVERTISER_IDS || "7320546391249747970")
  .split(",").map((s) => s.trim()).filter(Boolean);

type StoreInfo = { store_id: string; store_name: string; store_code: string; is_gmv_max_available: boolean };
type GmvReportRow = {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
};
type GmvApiResponse = {
  code: number;
  message?: string;
  data?: { list?: GmvReportRow[]; page_info?: { page: number; total_page: number; total_number: number } };
};

/** Get GMV Max enabled stores for an advertiser */
async function getGmvMaxStores(token: string, advId: string): Promise<StoreInfo[]> {
  const url = `${TT_BASE}/gmv_max/store/list/?advertiser_id=${advId}`;
  const res = await fetch(url, { headers: { "Access-Token": token } });
  const json = await res.json() as { code: number; data?: { store_list?: StoreInfo[] } };
  if (json.code !== 0) return [];
  return (json.data?.store_list || []).filter((s) => s.is_gmv_max_available);
}

/** Fetch all pages of a GMV Max report */
async function fetchAllPages(
  token: string, advId: string, storeId: string,
  dimensions: string[], metrics: string[],
  from: string, to: string,
  filterCampaignId?: string,
): Promise<GmvReportRow[]> {
  const allRows: GmvReportRow[] = [];
  let page = 1;
  while (true) {
    let url = `${TT_BASE}/gmv_max/report/get/` +
      `?advertiser_id=${advId}` +
      `&store_ids=${encodeURIComponent(`["${storeId}"]`)}` +
      `&dimensions=${encodeURIComponent(JSON.stringify(dimensions))}` +
      `&metrics=${encodeURIComponent(JSON.stringify(metrics))}` +
      `&start_date=${from}&end_date=${to}` +
      `&page_size=200&page=${page}`;
    if (filterCampaignId) {
      url += `&filtering=${encodeURIComponent(JSON.stringify({ campaign_ids: [filterCampaignId] }))}`;
    }
    const res = await fetch(url, { headers: { "Access-Token": token } });
    const json = await res.json() as GmvApiResponse;
    if (json.code !== 0) break;
    allRows.push(...(json.data?.list || []));
    const pi = json.data?.page_info;
    if (!pi || page >= pi.total_page) break;
    page++;
    if (page % 10 === 0) await new Promise((r) => setTimeout(r, 300));
  }
  return allRows;
}

/**
 * Sync GMV Max daily data + product breakdown
 */
export async function syncGmvMax(opts: { from?: string; to?: string } = {}): Promise<{
  fetched: number; stores: number; products: number; errors: string[];
}> {
  const from = opts.from || dateVN(null, -7);
  const to = opts.to || dateVN();
  const token = await getAccessToken();
  await validateTiktokToken(token);

  const db = supabaseAdmin();
  const errors: string[] = [];
  let fetched = 0;
  let productCount = 0;
  const storesSynced = new Set<string>();

  for (const advId of ADVERTISER_IDS) {
    const stores = await getGmvMaxStores(token, advId);
    if (stores.length === 0) continue;

    for (const store of stores) {
      storesSynced.add(store.store_id);

      try {
        // ── Daily aggregated data (campaign_id dimension, aggregate by date) ──
        const rows = await fetchAllPages(
          token, advId, store.store_id,
          ["campaign_id", "stat_time_day"],
          ["gross_revenue", "roi", "orders", "cost_per_order"],
          from, to,
        );

        // Aggregate by date
        const byDate = new Map<string, { rev: number; orders: number; spend: number; cpo: number }>();
        for (const r of rows) {
          const date = (r.dimensions.stat_time_day || "").substring(0, 10);
          if (!date) continue;
          const rev = parseFloat(r.metrics.gross_revenue || "0");
          const roi = parseFloat(r.metrics.roi || "0");
          const orders = parseInt(r.metrics.orders || "0");
          const spend = roi > 0 ? rev / roi : 0;
          const cur = byDate.get(date) || { rev: 0, orders: 0, spend: 0, cpo: 0 };
          cur.rev += rev;
          cur.orders += orders;
          cur.spend += spend;
          byDate.set(date, cur);
        }

        // Upsert daily rows
        const dailyRows = Array.from(byDate.entries()).map(([date, d]) => ({
          date,
          store_id: store.store_id,
          advertiser_id: advId,
          store_name: store.store_name,
          store_code: store.store_code,
          spend: Math.round(d.spend),
          gross_revenue: Math.round(d.rev),
          roi: d.spend > 0 ? parseFloat((d.rev / d.spend).toFixed(2)) : 0,
          orders: d.orders,
          cost_per_order: d.orders > 0 ? Math.round(d.spend / d.orders) : 0,
          synced_at: nowVN(),
        }));

        if (dailyRows.length) {
          const { error } = await db
            .from("tiktok_gmv_max")
            .upsert(dailyRows, { onConflict: "date,store_id" });
          if (error) errors.push(`${store.store_name} daily: ${error.message}`);
          else fetched += dailyRows.length;
        }

        // ── Product breakdown ──
        // Get active campaigns (with revenue)
        const activeCampaigns = rows
          .filter((r) => parseFloat(r.metrics.gross_revenue || "0") > 0)
          .map((r) => r.dimensions.campaign_id)
          .filter((v, i, a) => a.indexOf(v) === i); // dedupe

        const productMap = new Map<string, { rev: number; orders: number; spend: number; campaignId: string }>();

        for (const campId of activeCampaigns) {
          const prodRows = await fetchAllPages(
            token, advId, store.store_id,
            ["campaign_id", "item_group_id"],
            ["gross_revenue", "roi", "orders"],
            from, to,
            campId,
          );
          for (const r of prodRows) {
            const key = `${r.dimensions.item_group_id}`;
            const rev = parseFloat(r.metrics.gross_revenue || "0");
            const roi = parseFloat(r.metrics.roi || "0");
            const orders = parseInt(r.metrics.orders || "0");
            const spend = roi > 0 ? rev / roi : 0;
            const cur = productMap.get(key) || { rev: 0, orders: 0, spend: 0, campaignId: campId };
            cur.rev += rev;
            cur.orders += orders;
            cur.spend += spend;
            productMap.set(key, cur);
          }
          // Rate limit
          if (activeCampaigns.length > 5) await new Promise((r) => setTimeout(r, 200));
        }

        // Upsert products (aggregate to single date range)
        const prodRows = Array.from(productMap.entries()).map(([itemGroupId, d]) => ({
          date: from,
          store_id: store.store_id,
          item_group_id: itemGroupId,
          campaign_id: d.campaignId,
          spend: Math.round(d.spend),
          gross_revenue: Math.round(d.rev),
          roi: d.spend > 0 ? parseFloat((d.rev / d.spend).toFixed(2)) : 0,
          orders: d.orders,
          cost_per_order: d.orders > 0 ? Math.round(d.spend / d.orders) : 0,
          synced_at: nowVN(),
        }));

        if (prodRows.length) {
          const { error } = await db
            .from("tiktok_gmv_max_products")
            .upsert(prodRows, { onConflict: "date,store_id,item_group_id" });
          if (error) {
            if (!error.message.includes("does not exist")) {
              errors.push(`${store.store_name} products: ${error.message}`);
            }
          } else {
            productCount += prodRows.length;
          }
        }
      } catch (e) {
        errors.push(`${store.store_name}: ${(e as Error).message}`);
      }
    }
  }

  return { fetched, stores: storesSynced.size, products: productCount, errors };
}
