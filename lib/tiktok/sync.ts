import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";

// TikTok Ads (Business API) — sync skeleton.
// Credentials live in .env.local:
//   TIKTOK_APP_ID, TIKTOK_APP_SECRET, TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_IDS (CSV)
// If any are missing, sync functions return an error telling what's needed.

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

function requireEnv(keys: string[]): string | null {
  for (const k of keys) if (!process.env[k]) return `Thiếu ${k} trong .env.local`;
  return null;
}

type TtReportRow = {
  dimensions?: { advertiser_id?: string; stat_time_day?: string };
  metrics?: {
    spend?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    reach?: string | number;
    conversion?: string | number;
    total_purchase_value?: string | number;
  };
  advertiser_id?: string;
  stat_time_day?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  reach?: string | number;
  conversion?: string | number;
  total_purchase_value?: string | number;
};

export async function syncTiktokAds(opts: { from?: string; to?: string } = {}): Promise<{
  fetched: number; advertisers: number; errors: string[];
}> {
  const missing = requireEnv(["TIKTOK_ACCESS_TOKEN", "TIKTOK_ADVERTISER_IDS"]);
  if (missing) throw new Error(missing);

  const from = opts.from || dateVN(null, -7);
  const to = opts.to || dateVN();
  const token = process.env.TIKTOK_ACCESS_TOKEN!;
  const advertiserIds = process.env.TIKTOK_ADVERTISER_IDS!.split(",").map((s) => s.trim()).filter(Boolean);

  const db = supabaseAdmin();
  const errors: string[] = [];
  let fetched = 0;

  for (const advId of advertiserIds) {
    try {
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
        const date = String(row.dimensions?.stat_time_day || row.stat_time_day || from).substring(0, 10);
        const m = row.metrics || row;
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
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      errors.push(`${advId}: ${(e as Error).message}`);
    }
  }

  return { fetched, advertisers: advertiserIds.length, errors };
}
