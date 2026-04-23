import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { shopeeGet, SHOP_NAMES } from "./api";
import { nowVN, dateVN } from "@/lib/helpers";

// Shopee Ads API date format: DD-MM-YYYY
function toShopeeDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

type HourlyRow = {
  hour: number;
  date: string;
  impression: number;
  clicks: number;
  expense: number;
  broad_order: number;
  broad_gmv: number;
  direct_order: number;
  direct_gmv: number;
  broad_roas: number;
};

/** Sync shop-level CPC ads daily totals using hourly API (aggregated per day) */
export async function syncShopeeAdsDaily(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ ok: boolean; rows: number; logs: string[] }> {
  const logs: string[] = [];
  const db = supabaseAdmin();
  const to = opts.to || dateVN();
  const from = opts.from || dateVN(null, -1);
  let totalRows = 0;

  // Build date list
  const dateList: string[] = [];
  const cursor = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (cursor <= end) {
    dateList.push(cursor.toISOString().substring(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  const shopIds = Object.keys(SHOP_NAMES);

  for (const shopId of shopIds) {
    const shopName = SHOP_NAMES[shopId];
    logs.push(`[shopeeAds] Shop ${shopName} (${shopId})`);

    for (const dateStr of dateList) {
      const perfDate = toShopeeDate(dateStr);
      const hourlyRes = await shopeeGet(shopId, "/api/v2/ads/get_all_cpc_ads_hourly_performance", {
        performance_date: perfDate,
      });

      if (hourlyRes.error && hourlyRes.error !== "" && hourlyRes.error !== "-") {
        logs.push(`[shopeeAds] ${shopName} ${dateStr}: error: ${hourlyRes.error} ${hourlyRes.message || ""}`);
        continue;
      }

      const hours = hourlyRes.response as HourlyRow[];
      if (!Array.isArray(hours) || !hours.length) {
        logs.push(`[shopeeAds] ${shopName} ${dateStr}: no data`);
        continue;
      }

      // Aggregate hourly → daily totals
      const totals = hours.reduce(
        (acc, h) => ({
          spend: acc.spend + (h.expense || 0),
          impressions: acc.impressions + (h.impression || 0),
          clicks: acc.clicks + (h.clicks || 0),
          orders: acc.orders + (h.broad_order || 0),
          revenue: acc.revenue + (h.broad_gmv || 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0 }
      );

      const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

      // Delete existing API rows for this shop+date, then insert
      await db.from("shopee_ads").delete()
        .eq("shop", shopName)
        .eq("date", dateStr)
        .eq("campaign_name", "TỔNG (API)");

      const { error } = await db.from("shopee_ads").insert({
        date: dateStr,
        campaign_name: "TỔNG (API)",
        ad_type: "all",
        spend: totals.spend,
        impressions: totals.impressions,
        clicks: totals.clicks,
        orders: totals.orders,
        revenue: totals.revenue,
        roas: Math.round(roas * 100) / 100,
        synced_at: nowVN(),
        shop: shopName,
        period_from: dateStr,
        period_to: dateStr,
      });

      if (error) {
        logs.push(`[shopeeAds] ${shopName} ${dateStr}: insert error: ${error.message}`);
      } else {
        totalRows++;
        logs.push(`[shopeeAds] ${shopName} ${dateStr}: spend=${Math.round(totals.spend).toLocaleString()}, revenue=${Math.round(totals.revenue).toLocaleString()}, ROAS=${roas.toFixed(1)}`);
      }

      // Rate limit between API calls
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  logs.push(`[shopeeAds] Done: ${totalRows} rows`);
  return { ok: true, rows: totalRows, logs };
}
