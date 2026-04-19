import { NextResponse } from "next/server";
import { syncProductsAndInventory, syncSalesByChannel } from "@/lib/nhanh/sync";
import { syncFbAds, syncFbPageInsights } from "@/lib/fb/sync";
import { refreshAllShopTokens } from "@/lib/tiktok/shop-api";
import { syncTiktokAds } from "@/lib/tiktok/sync";
import { syncAllShopsOrders, syncAllShopsReturns } from "@/lib/tiktok/shop-sync";
import { refreshAllShopeeTokens } from "@/lib/shopee/api";
import { syncProductSales } from "@/lib/nhanh/sync-product-sales";
import { refreshCustomerStats } from "@/lib/db/refresh-customer-stats";

export const maxDuration = 300;

// Triggered by Supabase pg_cron (see supabase/migrations/0005_cron.sql).
// Auth: Authorization: Bearer <CRON_SECRET> header.
//
// Runs all syncs in PARALLEL to fit within Vercel Pro's 300s limit.
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();

  const jobs = [
    { name: "products_inventory", fn: () => syncProductsAndInventory() },
    { name: "sales",              fn: () => syncSalesByChannel({}) },
    { name: "fb_ads",             fn: () => syncFbAds({}) },
    { name: "fb_insights",        fn: () => syncFbPageInsights() },
    { name: "tiktok_shop_refresh", fn: () => refreshAllShopTokens() },
    { name: "shopee_token_refresh", fn: () => refreshAllShopeeTokens() },
    { name: "tiktok_ads",         fn: () => syncTiktokAds({}) },
    { name: "product_sales",      fn: () => syncProductSales({}) },
    { name: "tiktok_shop_orders", fn: () => syncAllShopsOrders({}) },
    { name: "tiktok_shop_returns", fn: () => syncAllShopsReturns({}) },
    { name: "customer_stats",    fn: () => refreshCustomerStats() },
  ] as const;

  const settled = await Promise.allSettled(jobs.map((j) => j.fn()));
  const results: Record<string, unknown> = {};
  for (let i = 0; i < jobs.length; i++) {
    const s = settled[i];
    results[jobs[i].name] = s.status === "fulfilled"
      ? { ok: true, ...s.value }
      : { ok: false, error: s.reason instanceof Error ? s.reason.message : String(s.reason) };
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - t0,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
