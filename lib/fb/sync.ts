import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateVN, nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

function adsToken(): string {
  const t = process.env.FB_ACCESS_TOKEN;
  if (!t) throw new Error("Thiếu FB_ACCESS_TOKEN trong .env.local");
  return t;
}

function pageToken(): string {
  const t = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!t) throw new Error("Thiếu FB_PAGE_ACCESS_TOKEN trong .env.local");
  return t;
}

// ─── FB Ads Insights ─────────────────────────────────────────
type AdInsight = {
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  reach?: string | number;
  date_start?: string;
  action_values?: Array<{ action_type?: string; value?: string | number }>;
};

async function fetchAdAccounts(): Promise<string[]> {
  const { data = [] } = await supabaseAdmin()
    .from("pages")
    .select("ad_account_id")
    .not("ad_account_id", "is", null);
  const ids = new Set<string>();
  for (const r of data || []) {
    const id = String(r.ad_account_id || "").trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export async function syncFbAds(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ fetched: number; accounts: number; errors: string[] }> {
  const token = adsToken();
  const from = opts.from || dateVN(null, -7);
  const to = opts.to || dateVN();
  const accounts = await fetchAdAccounts();
  if (!accounts.length) return { fetched: 0, accounts: 0, errors: ["Không có ad_account_id trong bảng pages"] };

  const db = supabaseAdmin();
  const today = dateVN();
  const errors: string[] = [];
  let fetched = 0;

  for (const acctId of accounts) {
    try {
      const timeRange = JSON.stringify({ since: from, until: to });
      const url =
        `${FB_GRAPH}/${encodeURIComponent(acctId)}/insights` +
        `?fields=spend,impressions,clicks,reach,action_values,date_start` +
        `&time_range=${encodeURIComponent(timeRange)}` +
        `&time_increment=1&level=account` +
        `&access_token=${token}`;
      const res = await fetch(url);
      const json = (await res.json()) as { data?: AdInsight[]; error?: { message?: string } };
      if (json.error) {
        errors.push(`${acctId}: ${json.error.message || "unknown"}`);
        continue;
      }

      const rows = (json.data || []).map((row) => {
        const date = String(row.date_start || from).substring(0, 10);
        let pv = 0;
        for (const av of row.action_values || []) {
          if (av.action_type === "purchase" || av.action_type === "omni_purchase") {
            pv += toNum(av.value);
          }
        }
        return {
          date,
          ad_account_id: acctId,
          account_name: null,
          spend: toNum(row.spend),
          impressions: toNum(row.impressions),
          clicks: toNum(row.clicks),
          reach: toNum(row.reach),
          purchase_value: pv,
          synced_at: nowVN(),
          is_today: date === today,
        };
      });

      if (rows.length) {
        const { error } = await db
          .from("ads_cache")
          .upsert(rows, { onConflict: "date,ad_account_id" });
        if (error) errors.push(`${acctId} upsert: ${error.message}`);
        else fetched += rows.length;
      }
      // rate limit gentle
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      errors.push(`${acctId}: ${(e as Error).message}`);
    }
  }

  return { fetched, accounts: accounts.length, errors };
}

// ─── FB Page Insights ────────────────────────────────────────
type PageInsightValue = { value?: number; end_time?: string };
type PageInsightEntry = { name?: string; values?: PageInsightValue[] };

async function fetchPageIds(): Promise<Array<{ page_id: string; page_name: string | null }>> {
  const { data = [] } = await supabaseAdmin()
    .from("pages")
    .select("fb_page_id, page_name")
    .not("fb_page_id", "is", null);
  return (data || [])
    .filter((p) => p.fb_page_id)
    .map((p) => ({ page_id: String(p.fb_page_id), page_name: p.page_name }));
}

export async function syncFbPageInsights(opts: { days?: number } = {}): Promise<{
  fetched: number;
  pages: number;
  errors: string[];
}> {
  const token = pageToken();
  const days = opts.days || 30;
  const pages = await fetchPageIds();
  if (!pages.length) return { fetched: 0, pages: 0, errors: ["Không có fb_page_id"] };

  const db = supabaseAdmin();
  const errors: string[] = [];
  let fetched = 0;

  for (const page of pages) {
    try {
      // Metrics: page_fan_adds, page_fan_removes, page_impressions, page_impressions_unique (reach)
      const metrics = "page_fan_adds,page_fan_removes,page_impressions,page_impressions_unique";
      const url =
        `${FB_GRAPH}/${page.page_id}/insights` +
        `/${metrics}?period=day&date_preset=last_30d` +
        `&access_token=${token}`;
      const res = await fetch(url);
      const json = (await res.json()) as { data?: PageInsightEntry[]; error?: { message?: string } };
      if (json.error) {
        errors.push(`${page.page_id}: ${json.error.message}`);
        continue;
      }

      // Each metric returns an array of {value, end_time}
      const byDate = new Map<string, {
        new_fans: number; lost_fans: number;
        impressions: number; reach: number;
      }>();
      for (const entry of json.data || []) {
        for (const v of entry.values || []) {
          if (!v.end_time) continue;
          const d = v.end_time.substring(0, 10);
          const cur = byDate.get(d) || { new_fans: 0, lost_fans: 0, impressions: 0, reach: 0 };
          if (entry.name === "page_fan_adds") cur.new_fans = toNum(v.value);
          else if (entry.name === "page_fan_removes") cur.lost_fans = toNum(v.value);
          else if (entry.name === "page_impressions") cur.impressions = toNum(v.value);
          else if (entry.name === "page_impressions_unique") cur.reach = toNum(v.value);
          byDate.set(d, cur);
        }
      }

      const rows = Array.from(byDate.entries()).map(([date, m]) => ({
        date,
        page_id: page.page_id,
        page_name: page.page_name,
        new_fans: m.new_fans,
        lost_fans: m.lost_fans,
        net_fans: m.new_fans - m.lost_fans,
        reach: m.reach,
        impressions: m.impressions,
        synced_at: nowVN(),
      }));

      if (rows.length) {
        const { error } = await db
          .from("insights_cache")
          .upsert(rows, { onConflict: "date,page_id" });
        if (error) errors.push(`${page.page_id}: ${error.message}`);
        else fetched += rows.length;
      }
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      errors.push(`${page.page_id}: ${(e as Error).message}`);
    }
    void days; // silence unused if we drop the param later
  }

  return { fetched, pages: pages.length, errors };
}
