import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { getAccessToken, validateTiktokToken } from "@/lib/tiktok/auth";

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

type TtReportRow = {
  dimensions?: { advertiser_id?: string; stat_time_day?: string; campaign_id?: string };
  metrics?: {
    spend?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    reach?: string | number;
    conversion?: string | number;
    total_purchase_value?: string | number;
    campaign_name?: string;
  };
};

/**
 * Sync TikTok Ads — 2 levels:
 * 1. AUCTION_ADVERTISER: aggregate per advertiser (backward compat)
 * 2. AUCTION_CAMPAIGN: per campaign, includes promotion_type to distinguish BM vs GMV Max
 */
export async function syncTiktokAds(opts: { from?: string; to?: string } = {}): Promise<{
  fetched: number; advertisers: number; errors: string[];
}> {
  const from = opts.from || dateVN(null, -7);
  const to = opts.to || dateVN();
  const token = await getAccessToken();
  const advertiserIds = process.env.TIKTOK_ADVERTISER_IDS!.split(",").map((s) => s.trim()).filter(Boolean);

  await validateTiktokToken(token);

  const db = supabaseAdmin();
  const errors: string[] = [];
  let fetched = 0;

  for (const advId of advertiserIds) {
    try {
      // ── Level 1: Advertiser aggregate (for tiktok_ads table) ──
      const url =
        `${TT_BASE}/report/integrated/get/` +
        `?advertiser_id=${advId}` +
        `&report_type=BASIC&data_level=AUCTION_ADVERTISER` +
        `&dimensions=${encodeURIComponent('["stat_time_day","advertiser_id"]')}` +
        `&metrics=${encodeURIComponent('["spend","impressions","clicks","reach","conversion","total_purchase_value"]')}` +
        `&start_date=${from}&end_date=${to}`;
      const res = await fetch(url, { headers: { "Access-Token": token } });
      const json = (await res.json()) as { code?: number; message?: string; data?: { list?: TtReportRow[] } };
      if (json.code !== 0) {
        errors.push(`${advId}: ${json.message || "unknown"}`);
        continue;
      }

      const rows = (json.data?.list || []).map((row) => {
        const date = String(row.dimensions?.stat_time_day || from).substring(0, 10);
        const m = row.metrics || {};
        return {
          date,
          advertiser_id: advId,
          advertiser_name: null,
          spend: toNum(m.spend),
          impressions: toNum(m.impressions),
          clicks: toNum(m.clicks),
          reach: toNum(m.reach),
          conversions: toNum(m.conversion),
          conversion_value: toNum(m.total_purchase_value),
          synced_at: nowVN(),
        };
      });
      if (rows.length) {
        const { error } = await db
          .from("tiktok_ads")
          .upsert(rows, { onConflict: "date,advertiser_id" });
        if (error) errors.push(`${advId} upsert: ${error.message}`);
        else fetched += rows.length;
      }

      // ── Level 2: Campaign detail (BM vs GMV Max) ──
      try {
        const campUrl =
          `${TT_BASE}/report/integrated/get/` +
          `?advertiser_id=${advId}` +
          `&report_type=BASIC&data_level=AUCTION_CAMPAIGN` +
          `&dimensions=${encodeURIComponent('["stat_time_day","campaign_id"]')}` +
          `&metrics=${encodeURIComponent('["spend","impressions","clicks","conversion","total_purchase_value","campaign_name","promotion_type"]')}` +
          `&start_date=${from}&end_date=${to}`;
        const campRes = await fetch(campUrl, { headers: { "Access-Token": token } });
        const campJson = (await campRes.json()) as { code?: number; message?: string; data?: { list?: TtReportRow[] } };
        if (campJson.code === 0 && campJson.data?.list?.length) {
          const campRows = campJson.data.list.map((row) => {
            const date = String(row.dimensions?.stat_time_day || from).substring(0, 10);
            const m = row.metrics || {};
            return {
              date,
              advertiser_id: advId,
              campaign_id: row.dimensions?.campaign_id || "",
              campaign_name: String(m.campaign_name || ""),
              promotion_type: String((m as Record<string, unknown>).promotion_type || "REGULAR"),
              spend: toNum(m.spend),
              impressions: toNum(m.impressions),
              clicks: toNum(m.clicks),
              conversions: toNum(m.conversion),
              conversion_value: toNum(m.total_purchase_value),
              synced_at: nowVN(),
            };
          });
          if (campRows.length) {
            const { error } = await db
              .from("tiktok_ads_campaigns")
              .upsert(campRows, { onConflict: "date,campaign_id" });
            if (error) {
              // Table might not exist yet — not critical
              if (!error.message.includes("does not exist")) {
                errors.push(`${advId} campaigns: ${error.message}`);
              }
            } else {
              fetched += campRows.length;
            }
          }
        }
      } catch {
        // Campaign-level sync is optional, don't fail the whole sync
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      errors.push(`${advId}: ${(e as Error).message}`);
    }
  }

  return { fetched, advertisers: advertiserIds.length, errors };
}
