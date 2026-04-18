import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/user";
import { nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";

export const maxDuration = 60;

/**
 * Upload TikTok ads CSV (for GMV Max or any manual ads data).
 * Accepts CSV with headers: date, spend (required), plus optional:
 *   campaign_name, impressions, clicks, conversions, conversion_value
 *
 * All rows are inserted with promotion_type = body.promotion_type (default "GMV_MAX")
 * and advertiser_id = body.advertiser_id (default "manual_upload").
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const promotionType = (formData.get("promotion_type") as string) || "GMV_MAX";
  const advertiserId = (formData.get("advertiser_id") as string) || "manual_upload";

  if (!file) return NextResponse.json({ ok: false, error: "Chưa chọn file" }, { status: 400 });

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return NextResponse.json({ ok: false, error: "File rỗng hoặc chỉ có header" }, { status: 400 });

  // Parse header
  const rawHeader = lines[0].split(/[,;\t]/);
  const header = rawHeader.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // Find column indices
  const dateIdx = header.findIndex((h) => h === "date" || h === "ngay" || h === "day");
  const spendIdx = header.findIndex((h) => h === "spend" || h === "cost" || h === "chi_phi" || h === "chiphi" || h === "total_cost");
  if (dateIdx < 0 || spendIdx < 0) {
    return NextResponse.json({
      ok: false,
      error: `Không tìm thấy cột date/spend. Header: [${rawHeader.join(", ")}]`,
    }, { status: 400 });
  }

  const nameIdx = header.findIndex((h) => h.includes("campaign") || h.includes("ten") || h.includes("name"));
  const impressIdx = header.findIndex((h) => h.includes("impression"));
  const clickIdx = header.findIndex((h) => h.includes("click"));
  const convIdx = header.findIndex((h) => h === "conversions" || h === "conversion" || h === "don");
  const convValIdx = header.findIndex((h) => h.includes("conversion_value") || h.includes("revenue") || h.includes("doanh_thu") || h === "gmv");

  const db = supabaseAdmin();
  const errors: string[] = [];
  let upserted = 0;

  // Parse rows
  const rows: Array<{
    date: string; advertiser_id: string; campaign_id: string; campaign_name: string;
    promotion_type: string; spend: number; impressions: number; clicks: number;
    conversions: number; conversion_value: number; synced_at: string;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length <= Math.max(dateIdx, spendIdx)) continue;

    const dateRaw = cols[dateIdx];
    // Parse date — accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
    let date = "";
    if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
      date = dateRaw.substring(0, 10);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateRaw)) {
      const [d, m, y] = dateRaw.split("/");
      date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else {
      errors.push(`Dòng ${i + 1}: date "${dateRaw}" không hợp lệ`);
      continue;
    }

    const spend = toNum(cols[spendIdx].replace(/[,.]/g, (c) => c === "," ? "" : "."));
    if (spend <= 0) continue;

    const campaignName = nameIdx >= 0 ? cols[nameIdx] || "" : "";
    const campaignId = `${promotionType}_${date}_${campaignName || i}`;

    rows.push({
      date,
      advertiser_id: advertiserId,
      campaign_id: campaignId,
      campaign_name: campaignName || promotionType,
      promotion_type: promotionType,
      spend,
      impressions: impressIdx >= 0 ? toNum(cols[impressIdx]) : 0,
      clicks: clickIdx >= 0 ? toNum(cols[clickIdx]) : 0,
      conversions: convIdx >= 0 ? toNum(cols[convIdx]) : 0,
      conversion_value: convValIdx >= 0 ? toNum(cols[convValIdx]) : 0,
      synced_at: nowVN(),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Không có dòng hợp lệ", errors }, { status: 400 });
  }

  // Upsert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await db
      .from("tiktok_ads_campaigns")
      .upsert(batch, { onConflict: "date,campaign_id" });
    if (error) errors.push(`Batch ${i}: ${error.message}`);
    else upserted += batch.length;
  }

  // Also aggregate into tiktok_ads table (daily totals per advertiser)
  const byDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number }>();
  for (const r of rows) {
    const cur = byDate.get(r.date) || { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 };
    cur.spend += r.spend;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.conversions += r.conversions;
    cur.conversion_value += r.conversion_value;
    byDate.set(r.date, cur);
  }

  const adsRows = Array.from(byDate.entries()).map(([date, v]) => ({
    date,
    advertiser_id: advertiserId,
    advertiser_name: promotionType,
    spend: v.spend,
    impressions: v.impressions,
    clicks: v.clicks,
    reach: 0,
    conversions: v.conversions,
    conversion_value: v.conversion_value,
    synced_at: nowVN(),
  }));
  if (adsRows.length) {
    const { error } = await db.from("tiktok_ads").upsert(adsRows, { onConflict: "date,advertiser_id" });
    if (error) errors.push(`tiktok_ads aggregate: ${error.message}`);
  }

  return NextResponse.json({
    ok: true,
    fetched: upserted,
    totalRows: rows.length,
    dateRange: rows.length > 0 ? `${rows[0].date} → ${rows[rows.length - 1].date}` : "",
    promotionType,
    errors,
  });
}
