import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";

// Scrape Nhanh.vn report API — returns exact "Doanh thu thành công" per channel/source.
// Uses session login (username/password) → POST report endpoint → parse JSON.

const NHANH_URL = "https://nhanh.vn";
const BUSINESS_ID = "119888";

type SourceData = {
  source: { id: number; name: string };
  pageId: string;
  shopId: string;
  saleChannel: number;
  totalOrder: number;
  totalValue: number;
  totalOrderSuccess: number;
  totalValueSuccess: number;
  totalOrderRefundedAndCanceled: number;
  totalValueRefundedAndCanceled: number;
};

type ChannelData = {
  channel: { id: number; name: string };
  sourceData: SourceData[];
};

type ReportResponse = {
  code: number;
  data: { saleChannel: ChannelData[] };
};

/** Login to Nhanh.vn and get session cookies + CSRF token */
async function nhanhLogin(): Promise<{ cookies: string; csrf: string } | null> {
  const username = process.env.NHANH_WEB_USERNAME;
  const password = process.env.NHANH_WEB_PASSWORD;
  if (!username || !password) return null;

  // Step 1: GET /login → extract CSRF token + session cookie
  const loginPage = await fetch(`${NHANH_URL}/login`, { redirect: "manual" });
  const setCookies = loginPage.headers.getSetCookie?.() || [];
  let csrf = "";
  const cookieJar: string[] = [];
  for (const c of setCookies) {
    const nameVal = c.split(";")[0];
    cookieJar.push(nameVal);
    if (nameVal.startsWith("Npos-Csrf-Token-V1=")) {
      csrf = nameVal.split("=").slice(1).join("=");
    }
  }
  if (!csrf) return null;

  // Step 2: POST /login with credentials
  const body = new URLSearchParams({ username, password });
  const loginRes = await fetch(`${NHANH_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Npos-Csrf-Token-V1": csrf,
      Cookie: cookieJar.join("; "),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const loginJson = (await loginRes.json()) as { code: number; data?: { userToken?: string } };
  if (loginJson.code !== 1) return null;

  // Collect all cookies from login response
  const postCookies = loginRes.headers.getSetCookie?.() || [];
  for (const c of postCookies) {
    cookieJar.push(c.split(";")[0]);
  }

  return { cookies: cookieJar.join("; "), csrf };
}

/** Fetch report data from Nhanh.vn for a date range */
async function fetchReport(
  session: { cookies: string; csrf: string },
  fromDate: string,
  toDate: string,
  orderDate: "success" | "create" = "success",
): Promise<ChannelData[]> {
  const body = new URLSearchParams({
    orderDate,
    fromDate,
    toDate,
    businessId: BUSINESS_ID,
  });

  const res = await fetch(`${NHANH_URL}/report/order/salechannel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Npos-Csrf-Token-V1": session.csrf,
      Cookie: session.cookies,
    },
    body: body.toString(),
  });

  const json = (await res.json()) as ReportResponse;
  if (json.code !== 1) return [];
  return json.data?.saleChannel || [];
}

// Channel ID → name mapping (Nhanh uses different IDs than V3 API)
const CHANNEL_NAMES: Record<number, string> = {
  1: "Admin",
  5: "API",
  10: "API",    // Nhanh dùng cả ID 5 và 10 cho API/Web orders
  20: "Facebook",
  42: "Shopee",
  48: "TikTok",
};

/** Sync revenue from Nhanh report for a single date */
export async function syncNhanhReport(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ ok: boolean; days: number; rows: number; error?: string; logs?: string[] }> {
  const logs: string[] = [];
  const session = await nhanhLogin();
  if (!session) {
    return { ok: false, days: 0, rows: 0, error: "Nhanh login failed — check NHANH_WEB_USERNAME/PASSWORD" };
  }
  logs.push("[nhanhReport] Logged in OK");

  const to = opts.to || dateVN();
  const from = opts.from || dateVN(null, -1); // default: yesterday

  // Fetch day by day for accurate per-date data
  const db = supabaseAdmin();
  let totalRows = 0;
  let days = 0;

  // Build date list from from→to (string comparison, no timezone issues)
  const dateList: string[] = [];
  const cursor = new Date(from + "T12:00:00Z"); // noon UTC to avoid timezone shift
  const end = new Date(to + "T12:00:00Z");
  while (cursor <= end) {
    dateList.push(cursor.toISOString().substring(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Load page name mapping: fb_page_id → nhanh_id (e.g. "100945322277996" → "Lỗ Vũ")
  const { data: pagesData } = await db.from("pages")
    .select("fb_page_id, nhanh_id")
    .eq("platform", "Facebook")
    .eq("is_active", true);
  const pageNameMap = new Map<string, string>();
  for (const p of pagesData || []) {
    if (p.fb_page_id && p.nhanh_id) pageNameMap.set(p.fb_page_id, p.nhanh_id);
  }

  for (const dateStr of dateList) {
    logs.push(`[nhanhReport] Fetching ${dateStr}...`);

    const channels = await fetchReport(session, dateStr, dateStr);

    // ── Step 1: Build all data BEFORE touching DB ──

    // 1a. Build from success report (may be empty early in the day)
    const agg = new Map<string, Record<string, unknown>>();
    for (const ch of channels) {
      const channelName = CHANNEL_NAMES[ch.channel.id] || ch.channel.name;
      for (const src of ch.sourceData) {
        const sourceName = src.source.name
          || (src.pageId && pageNameMap.get(src.pageId))
          || src.pageId || src.shopId || channelName;
        const key = `${channelName}|${sourceName}`;
        const existing = agg.get(key);
        if (existing) {
          existing.order_total = Number(existing.order_total) + src.totalOrder;
          existing.order_cancel = Number(existing.order_cancel) + (src.totalOrderRefundedAndCanceled || 0);
          existing.revenue_total = Number(existing.revenue_total) + src.totalValue;
          existing.revenue_cancel = Number(existing.revenue_cancel) + (src.totalValueRefundedAndCanceled || 0);
          existing.order_success = Number(existing.order_success) + src.totalOrderSuccess;
          existing.revenue_success = Number(existing.revenue_success) + src.totalValueSuccess;
          existing.revenue_net = Number(existing.revenue_net) + src.totalValueSuccess;
          existing.order_net = Number(existing.order_total) - Number(existing.order_cancel);
          continue;
        }
        agg.set(key, {
          channel: channelName,
          source: sourceName,
          period_from: dateStr,
          period_to: dateStr,
          order_total: src.totalOrder,
          order_cancel: src.totalOrderRefundedAndCanceled || 0,
          order_net: src.totalOrder - (src.totalOrderRefundedAndCanceled || 0),
          revenue_total: src.totalValue,
          revenue_cancel: src.totalValueRefundedAndCanceled || 0,
          revenue_net: src.totalValueSuccess,
          order_success: src.totalOrderSuccess,
          revenue_success: src.totalValueSuccess,
          revenue_expected: 0,
          synced_at: nowVN(),
        });
      }
    }

    // 1b. Fetch create report for revenue_expected (Đơn tạo - Hoàn hủy)
    await new Promise((r) => setTimeout(r, 300));
    const createChannels = await fetchReport(session, dateStr, dateStr, "create");
    if (createChannels.length) {
      for (const ch of createChannels) {
        const channelName = CHANNEL_NAMES[ch.channel.id] || ch.channel.name;
        for (const src of ch.sourceData) {
          const sourceName = src.source.name
            || (src.pageId && pageNameMap.get(src.pageId))
            || src.pageId || src.shopId || channelName;
          const key = `${channelName}|${sourceName}`;
          const revenueExpected = src.totalValue - (src.totalValueRefundedAndCanceled || 0);
          const existing = agg.get(key);
          if (existing) {
            existing.revenue_expected = (Number(existing.revenue_expected) || 0) + revenueExpected;
          } else {
            agg.set(key, {
              channel: channelName,
              source: sourceName,
              period_from: dateStr,
              period_to: dateStr,
              order_total: src.totalOrder,
              order_cancel: src.totalOrderRefundedAndCanceled || 0,
              order_net: src.totalOrder - (src.totalOrderRefundedAndCanceled || 0),
              revenue_total: src.totalValue,
              revenue_cancel: src.totalValueRefundedAndCanceled || 0,
              revenue_net: 0,
              order_success: 0,
              revenue_success: 0,
              revenue_expected: revenueExpected,
              synced_at: nowVN(),
            });
          }
        }
      }
    }

    const rows = Array.from(agg.values());

    // Skip if both success + create returned nothing
    if (rows.length === 0) {
      logs.push(`[nhanhReport] ${dateStr}: no data from success or create, skipped`);
      continue;
    }

    // ── Step 2: Safety checks BEFORE writing ──
    const { count: existingCount } = await db
      .from("sales_sync")
      .select("*", { count: "exact", head: true })
      .eq("period_from", dateStr)
      .eq("period_to", dateStr);

    // 2a. Partial data check (row count)
    const newSourceCount = channels.reduce((s, ch) => s + ch.sourceData.length, 0);
    if ((existingCount || 0) > 0 && newSourceCount < (existingCount || 0) * 0.5) {
      logs.push(`[nhanhReport] ${dateStr}: partial data (${newSourceCount} vs ${existingCount} existing), skipped`);
      continue;
    }

    // 2b. revenue_expected preservation handled in Step 3 (merge before write)

    // ── Step 3: Upsert (no delete) — preserve existing revenue_expected ──
    // If new row has revenue_expected=0 but DB has >0, keep DB value
    if (rows.length) {
      // Load existing expected values to merge
      const { data: existingRows } = await db.from("sales_sync")
        .select("channel, source, revenue_expected")
        .eq("period_from", dateStr).eq("period_to", dateStr);
      const existingExpMap = new Map<string, number>();
      for (const r of existingRows || []) {
        const key = `${r.channel}|${r.source}`;
        if (Number(r.revenue_expected || 0) > 0) existingExpMap.set(key, Number(r.revenue_expected));
      }

      // Merge: keep existing expected if new is 0
      for (const row of rows) {
        if (Number(row.revenue_expected || 0) === 0) {
          const key = `${row.channel}|${row.source}`;
          const existingExp = existingExpMap.get(key);
          if (existingExp && existingExp > 0) {
            row.revenue_expected = existingExp;
          }
        }
      }

      // DELETE old + INSERT new. DB triggers protect revenue_expected on both UPDATE and INSERT.
      await db.from("sales_sync").delete().eq("period_from", dateStr).eq("period_to", dateStr);
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await db
          .from("sales_sync")
          .upsert(chunk, { onConflict: "channel,source,period_from,period_to" });
        if (error) {
          logs.push(`[nhanhReport] ${dateStr}: upsert error: ${error.message}`);
        }
      }
      totalRows += rows.length;
    }

    const totalSuccess = rows.reduce((s, r) => s + Number(r.revenue_success || 0), 0);
    const totalExpected = rows.reduce((s, r) => s + Number(r.revenue_expected || 0), 0);
    logs.push(`[nhanhReport] ${dateStr}: ${rows.length} sources, DT TC: ${(totalSuccess / 1e6).toFixed(1)}M, DK: ${(totalExpected / 1e6).toFixed(1)}M`);
    days++;

    // Rate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  logs.push(`[nhanhReport] Done: ${days} days, ${totalRows} rows`);
  return { ok: true, days, rows: totalRows, logs };
}
