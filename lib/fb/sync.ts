import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateVN, nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

// ─── Token management (DB-backed with auto-refresh) ─────────

type FbToken = { token_type: string; access_token: string; expire_at: number; updated_at: string };

async function getDbToken(): Promise<FbToken | null> {
  const { data } = await supabaseAdmin()
    .from("fb_tokens")
    .select("*")
    .eq("token_type", "user")
    .maybeSingle();
  return data as FbToken | null;
}

async function saveDbToken(accessToken: string, expireAt: number) {
  await supabaseAdmin().from("fb_tokens").upsert({
    token_type: "user",
    access_token: accessToken,
    expire_at: expireAt,
    updated_at: nowVN(),
  }, { onConflict: "token_type" });
}

/** Exchange short-lived or long-lived token for a new long-lived token (60 days) */
export async function exchangeForLongLived(inputToken: string): Promise<{ token: string; expiresIn: number }> {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Thiếu FB_APP_ID hoặc FB_APP_SECRET");

  const url = `${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token`
    + `&client_id=${appId}&client_secret=${appSecret}`
    + `&fb_exchange_token=${inputToken}`;
  const res = await fetch(url);
  const json = await res.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (json.error) throw new Error(`FB exchange token: ${json.error.message}`);
  if (!json.access_token) throw new Error("FB exchange: không nhận được access_token");
  return { token: json.access_token, expiresIn: json.expires_in || 5184000 };
}

/** Save a new FB token — exchanges for long-lived and stores in DB */
export async function saveFbToken(inputToken: string): Promise<{ ok: boolean; expiresInDays: number }> {
  const { token, expiresIn } = await exchangeForLongLived(inputToken);
  const expireAt = Math.floor(Date.now() / 1000) + expiresIn;
  await saveDbToken(token, expireAt);
  return { ok: true, expiresInDays: Math.floor(expiresIn / 86400) };
}

/** Refresh FB token if expiring within 7 days */
export async function refreshFbToken(): Promise<{ refreshed: boolean; error?: string; expiresInDays?: number }> {
  const dbToken = await getDbToken();
  if (!dbToken?.access_token) return { refreshed: false, error: "Chưa có FB token trong DB" };

  const now = Math.floor(Date.now() / 1000);
  const daysLeft = (dbToken.expire_at - now) / 86400;

  // Only refresh if expiring within 7 days
  if (daysLeft > 7) return { refreshed: false, expiresInDays: Math.floor(daysLeft) };

  try {
    const { token, expiresIn } = await exchangeForLongLived(dbToken.access_token);
    const expireAt = Math.floor(Date.now() / 1000) + expiresIn;
    await saveDbToken(token, expireAt);
    return { refreshed: true, expiresInDays: Math.floor(expiresIn / 86400) };
  } catch (e) {
    return { refreshed: false, error: (e as Error).message };
  }
}

/** Get FB token status */
export async function getFbTokenStatus(): Promise<{ hasToken: boolean; tokenOk: boolean; expireInDays: number }> {
  const dbToken = await getDbToken();
  if (!dbToken?.access_token) return { hasToken: false, tokenOk: false, expireInDays: 0 };
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = Math.max(0, Math.floor((dbToken.expire_at - now) / 86400));
  return { hasToken: true, tokenOk: dbToken.expire_at > now, expireInDays: daysLeft };
}

/** Get active token — DB first, fallback to env */
async function getActiveToken(): Promise<string> {
  // Try DB first
  const dbToken = await getDbToken();
  if (dbToken?.access_token) {
    const now = Math.floor(Date.now() / 1000);
    if (dbToken.expire_at > now) return dbToken.access_token;
    // Try refresh if expired but token exists
    const appId = process.env.FB_APP_ID;
    if (appId) {
      try {
        const { token, expiresIn } = await exchangeForLongLived(dbToken.access_token);
        await saveDbToken(token, Math.floor(Date.now() / 1000) + expiresIn);
        return token;
      } catch { /* fall through to env */ }
    }
  }
  // Fallback to env vars
  const envToken = process.env.FB_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
  if (!envToken) throw new Error("Không có FB token. Vào Cấu hình → Facebook để thêm token.");
  return envToken;
}

/** Quick token validity check */
async function validateToken(token: string, label: string): Promise<void> {
  const res = await fetch(`${FB_GRAPH}/me?access_token=${token}`);
  const json = await res.json() as { error?: { message?: string; code?: number } };
  if (json.error) {
    const msg = json.error.message || "Token không hợp lệ";
    if (msg.includes("expired")) {
      throw new Error(`${label} đã hết hạn. Vào Cấu hình → Facebook để cập nhật token.`);
    }
    throw new Error(`${label}: ${msg}`);
  }
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
  const token = await getActiveToken();
  await validateToken(token, "FB Token");
  const from = opts.from || dateVN(null, -7);
  const to = opts.to || dateVN();
  const accounts = await fetchAdAccounts();
  if (!accounts.length) return { fetched: 0, accounts: 0, errors: ["Không có ad_account_id trong bảng pages"] };

  const db = supabaseAdmin();
  const today = dateVN();
  const errors: string[] = [];
  let fetched = 0;

  // Build ad_account_id → page_name map from pages table
  const { data: pagesData } = await db.from("pages").select("ad_account_id, page_name").not("ad_account_id", "is", null);
  const acctNameMap = new Map<string, string>();
  for (const p of pagesData || []) {
    if (p.ad_account_id && p.page_name) {
      const name = String(p.page_name).replace(/^FACEBOOK - /, "");
      const existing = acctNameMap.get(p.ad_account_id);
      if (!existing) acctNameMap.set(p.ad_account_id, name);
      else if (!existing.includes(name)) acctNameMap.set(p.ad_account_id, existing + " + " + name);
    }
  }

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
          account_name: acctNameMap.get(acctId) || null,
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

type ManagedPage = { page_id: string; page_name: string; page_token: string };

/** Fetch page-specific access tokens from FB Graph API (needed for insights) */
async function fetchManagedPages(userToken: string): Promise<ManagedPage[]> {
  const result: ManagedPage[] = [];
  let url: string | null =
    `${FB_GRAPH}/me/accounts?fields=id,name,access_token&limit=50&access_token=${userToken}`;
  while (url) {
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
      paging?: { next?: string };
    };
    for (const p of json.data || []) {
      result.push({ page_id: p.id, page_name: p.name, page_token: p.access_token });
    }
    url = json.paging?.next || null;
  }
  return result;
}

export async function syncFbPageInsights(opts: { days?: number } = {}): Promise<{
  fetched: number;
  pages: number;
  errors: string[];
}> {
  const token = await getActiveToken();
  await validateToken(token, "FB Token");
  const days = opts.days || 30;

  // Get page-specific tokens from FB (required for insights API)
  const managedPages = await fetchManagedPages(token);
  if (!managedPages.length) return { fetched: 0, pages: 0, errors: ["Không tìm thấy page nào qua /me/accounts"] };

  const db = supabaseAdmin();
  const errors: string[] = [];
  let fetched = 0;

  for (const page of managedPages) {
    try {
      // Updated metrics (old page_fan_adds/page_fan_removes/page_impressions are deprecated)
      const metrics = "page_daily_follows,page_daily_unfollows,page_impressions_unique,page_post_engagements";
      const url =
        `${FB_GRAPH}/${page.page_id}/insights` +
        `/${metrics}?period=day&date_preset=last_30d` +
        `&access_token=${page.page_token}`;
      const res = await fetch(url);
      const json = (await res.json()) as { data?: PageInsightEntry[]; error?: { message?: string } };
      if (json.error) {
        errors.push(`${page.page_name}: ${json.error.message}`);
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
          if (entry.name === "page_daily_follows") cur.new_fans = toNum(v.value);
          else if (entry.name === "page_daily_unfollows") cur.lost_fans = toNum(v.value);
          else if (entry.name === "page_post_engagements") cur.impressions = toNum(v.value);
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
    void days;
  }

  return { fetched, pages: managedPages.length, errors };
}
