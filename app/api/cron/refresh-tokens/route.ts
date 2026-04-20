import { NextResponse } from "next/server";
import { refreshAllShopTokens } from "@/lib/tiktok/shop-api";
import { refreshAllShopeeTokens } from "@/lib/shopee/api";
import { refreshFbToken } from "@/lib/fb/sync";
import { syncSalesByChannel } from "@/lib/nhanh/sync";
import { syncFbAds, syncFbPageInsights } from "@/lib/fb/sync";

export const maxDuration = 300;

// Chạy mỗi 2 giờ — refresh tokens + sync sales + ads
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const results: Record<string, unknown> = {};

  try {
    const shopee = await refreshAllShopeeTokens();
    results.shopee = { ok: true, ...shopee };
  } catch (e) {
    results.shopee = { ok: false, error: (e as Error).message };
  }

  try {
    const tiktok = await refreshAllShopTokens();
    results.tiktok = { ok: true, ...tiktok };
  } catch (e) {
    results.tiktok = { ok: false, error: (e as Error).message };
  }

  try {
    const fb = await refreshFbToken();
    results.facebook = { ok: true, ...fb };
  } catch (e) {
    results.facebook = { ok: false, error: (e as Error).message };
  }

  // Sync sales + ads (all channels: Facebook, Shopee, TikTok, API, Admin)
  try {
    const sales = await syncSalesByChannel({});
    results.sales = { ok: true, channels: sales.channels, orders: sales.orders };
  } catch (e) {
    results.sales = { ok: false, error: (e as Error).message };
  }

  try {
    const ads = await syncFbAds({});
    results.fb_ads = { ok: true, ...ads };
  } catch (e) {
    results.fb_ads = { ok: false, error: (e as Error).message };
  }

  try {
    const insights = await syncFbPageInsights();
    results.fb_insights = { ok: true, ...insights };
  } catch (e) {
    results.fb_insights = { ok: false, error: (e as Error).message };
  }

  return NextResponse.json({ ok: true, duration_ms: Date.now() - t0, results });
}

export async function GET(req: Request) {
  return POST(req);
}
